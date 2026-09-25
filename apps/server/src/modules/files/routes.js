import { Router } from 'express';
import multer from 'multer';
import { createHash, randomUUID } from 'node:crypto';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { hasPermission } from '../workspaces/permissions.js';
import { requireChannel } from '../channels/service.js';
import { putObject, getObject, deleteObject } from './storage.js';
import { getMessage, serializeMessage, resolveMentionEmails, loadAttachments } from '../messages/service.js';
import { publish } from '../../websocket/index.js';
import { notifyUser } from '../notifications/routes.js';

export const filesRouter = Router();

const MAX_MB = Number(process.env.FILE_MAX_MB || 50);
// Denylist of directly-executable types (Slack parity: block hw-payloads, allow the rest).
const BLOCKED_EXT = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'sh', 'dll', 'jar']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 5 },
});

function extOf(name) {
  return (String(name).split('.').pop() || '').toLowerCase();
}

// Virus-scan hook stub: plug a real scanner here later (returns clean).
export async function scanFile(_buffer, _mime) {
  return { clean: true };
}

export function publicFile(f) {
  return {
    id: f.id,
    workspaceId: f.workspace_id,
    uploaderId: f.uploader_id,
    messageId: f.message_id,
    filename: f.filename,
    mimeType: f.mime_type,
    size: Number(f.size),
    createdAt: f.created_at,
  };
}

// Access rule (Slack parity): workspace member + if attached, channel access.
export async function fileAccess(fileId, userId) {
  const file = await getOne('SELECT * FROM files WHERE id = $1', [fileId]);
  if (!file) throw Object.assign(new Error('File not found'), { status: 404, code: 'NOT_FOUND' });
  const wsMember = await getOne('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [file.workspace_id, userId]);
  if (!wsMember) throw Object.assign(new Error('Not a workspace member'), { status: 403, code: 'FORBIDDEN' });
  if (file.message_id) {
    const msg = await getOne('SELECT channel_id FROM messages WHERE id = $1', [file.message_id]);
    if (msg) {
      const ch = await getOne('SELECT is_private FROM channels WHERE id = $1', [msg.channel_id]);
      if (ch?.is_private) {
        const cm = await getOne('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [msg.channel_id, userId]);
        if (!cm) throw Object.assign(new Error('Private channel'), { status: 403, code: 'FORBIDDEN' });
      }
    }
  }
  return { file, wsRole: wsMember.role };
}

// POST /workspaces/:wid/files — multipart upload (proxied MVP per plan).
filesRouter.post('/workspaces/:wid/files', requireAuth, async (req, res, next) => {
  const run = upload.array('files', 5);
  run(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: { code: status === 413 ? 'TOO_LARGE' : 'BAD_REQUEST', message: status === 413 ? `File exceeds ${MAX_MB}MB` : err.message } });
    }
    try {
      const ws = await getOne('SELECT * FROM workspaces WHERE id = $1', [req.params.wid]);
      if (!ws) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
      const member = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [ws.id, req.user.id]);
      if (!member) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
      if (!req.files?.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No files uploaded (field: files)' } });
      const out = [];
      for (const f of req.files) {
        const ext = extOf(f.originalname);
        if (BLOCKED_EXT.has(ext)) {
          return res.status(400).json({ error: { code: 'BLOCKED_TYPE', message: `Files of type .${ext} are not allowed` } });
        }
        const scan = await scanFile(f.buffer, f.mimetype);
        if (!scan.clean) return res.status(400).json({ error: { code: 'BLOCKED_TYPE', message: 'File rejected by scanner' } });
        const key = `${ws.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${f.originalname.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
        const stored = await putObject(key, f.buffer, f.mimetype);
        const checksum = createHash('sha256').update(f.buffer).digest('hex');
        const row = await getOne(
          `INSERT INTO files(workspace_id, uploader_id, filename, mime_type, size, storage_key, bucket, checksum)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [ws.id, req.user.id, f.originalname.slice(0, 255), f.mimetype || 'application/octet-stream', f.size, stored.key, stored.bucket, checksum]
        );
        out.push(publicFile(row));
      }
      res.status(201).json({ files: out });
    } catch (e) {
      next(e);
    }
  });
});

// GET /files/:id — perm-checked inline stream (browser previews).
filesRouter.get('/files/:id', requireAuth, async (req, res, next) => {
  try {
    const { file } = await fileAccess(req.params.id, req.user.id);
    const obj = await getObject(file.storage_key);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`);
    obj.body.pipe(res);
  } catch (e) {
    next(e);
  }
});

// DELETE /files/:id — uploader or DELETE_MESSAGE holders.
filesRouter.delete('/files/:id', requireAuth, async (req, res, next) => {
  try {
    const { file } = await fileAccess(req.params.id, req.user.id);
    const isOwner = file.uploader_id === req.user.id;
    const canMod = await hasPermission(file.workspace_id, req.user.id, 'DELETE_MESSAGE');
    if (!isOwner && !canMod) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot delete this file' } });
    await deleteObject(file.storage_key).catch(() => {});
    await query('DELETE FROM files WHERE id = $1', [file.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /files/:id/share {channelId, content?} — post file as a message attachment.
filesRouter.post('/files/:id/share', requireAuth, async (req, res, next) => {
  try {
    const { file } = await fileAccess(req.params.id, req.user.id);
    const { channelId, content } = req.body || {};
    if (!channelId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'channelId required' } });
    const ch = await getOne('SELECT * FROM channels WHERE id = $1 AND workspace_id = $2', [channelId, file.workspace_id]);
    if (!ch) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    const cm = await getOne('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [channelId, req.user.id]);
    if (!cm) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Join the channel to post' } });
    if (ch.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Channel is archived' } });
    const text = (content || file.filename).slice(0, 8000) || file.filename;
    const msg = await getOne(
      `INSERT INTO messages(workspace_id, channel_id, sender_id, content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [file.workspace_id, channelId, req.user.id, text]
    );
    await query('UPDATE files SET message_id = $1 WHERE id = $2', [msg.id, file.id]);
    await query('INSERT INTO message_attachments(message_id, file_id, filename, mime_type, size, url) VALUES ($1,$2,$3,$4,$5,$6)', [msg.id, file.id, file.filename, file.mime_type, file.size, `/files/${file.id}`]);
    const emailIds = await resolveMentionEmails(file.workspace_id, text);
    const all = emailIds.filter((id) => id !== req.user.id);
    for (const uid of all) {
      await query('INSERT INTO message_mentions(message_id, mentioned_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [msg.id, uid]);
      await notifyUser(uid, file.workspace_id, 'mention', msg.id);
    }
    const full = await getMessage(msg.id);
    const out = serializeMessage(full, { mentionIds: all, attachments: await loadAttachments([msg.id]) });
    await publish({ type: 'message.created', payload: { message: out } }, [`channel:${channelId}`]);
    res.status(201).json({ message: out });
  } catch (e) {
    next(e);
  }
});
