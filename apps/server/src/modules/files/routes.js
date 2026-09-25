import { Router } from 'express';
import multer from 'multer';
import { createHash, randomUUID } from 'node:crypto';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { hasPermission } from '../workspaces/permissions.js';
import { putObject, getObject, deleteObject, signedUrl, presignPut, headObject } from './storage.js';
import { imageDims, makeThumb } from './thumbs.js';
import { getMessage, serializeMessage, resolveMentionEmails, loadAttachments } from '../messages/service.js';
import { publish } from '../../websocket/index.js';
import { notifyUser } from '../notifications/routes.js';
import { filePresignSchema, fileShareSchema, validate } from '@teamchat/validation';

export const filesRouter = Router();

function maxMB() {
  return Number(process.env.FILE_MAX_MB || 50);
}
// Denylist of directly-executable types (Slack parity: block hw-payloads, allow the rest).
// Plan 07 also asks for an allowlist: FILE_ALLOWED_MIMES (comma list) optionally
// restricts further. Default = allow all except BLOCKED_EXT (tests + Slack UX).
const BLOCKED_EXT = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'sh', 'dll', 'jar']);

function allowedMimes() {
  const raw = (process.env.FILE_ALLOWED_MIMES || '').trim();
  if (!raw) return null;
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMB() * 1024 * 1024, files: 5 },
});

function extOf(name) {
  return (String(name).split('.').pop() || '').toLowerCase();
}

function checkType(filename, mime) {
  const ext = extOf(filename);
  if (BLOCKED_EXT.has(ext)) {
    const e = new Error(`Files of type .${ext} are not allowed`);
    e.status = 400;
    e.code = 'BLOCKED_TYPE';
    throw e;
  }
  const allow = allowedMimes();
  if (allow && mime && !allow.has(String(mime).toLowerCase())) {
    // Support wildcard prefixes like image/* via prefix match.
    const ok = [...allow].some((a) => a.endsWith('/*') && String(mime).toLowerCase().startsWith(a.slice(0, -1)));
    if (!ok) {
      const e = new Error(`MIME ${mime} not allowed`);
      e.status = 400;
      e.code = 'BLOCKED_TYPE';
      throw e;
    }
  }
  return ext;
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
    width: f.width != null ? Number(f.width) : null,
    height: f.height != null ? Number(f.height) : null,
    duration: f.duration != null ? Number(f.duration) : null,
    url: `/files/${f.id}`,
    thumbUrl: f.thumb_storage_key ? `/files/${f.id}/thumb` : null,
    createdAt: f.created_at,
  };
}

function storageKey(workspaceId, filename) {
  const safe = String(filename).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'file';
  return `${workspaceId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safe}`;
}

// Persist buffer + thumbnail, return files row. Shared by multipart + confirm flows.
async function storeBuffer({ workspaceId, uploaderId, filename, mimeType, buffer, size }) {
  const key = storageKey(workspaceId, filename);
  const stored = await putObject(key, buffer, mimeType);
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const dims = await imageDims(buffer, mimeType);
  let thumbKey = null;
  let thumbBucket = null;
  try {
    const thumb = await makeThumb(buffer, mimeType);
    if (thumb) {
      const tkey = `${key}.thumb.jpg`;
      const tst = await putObject(tkey, thumb.buffer, thumb.mimeType);
      thumbKey = tst.key;
      thumbBucket = tst.bucket;
    }
  } catch {
    thumbKey = null;
  }
  const row = await getOne(
    `INSERT INTO files(workspace_id, uploader_id, filename, mime_type, size, storage_key, bucket, checksum, width, height, thumb_storage_key, thumb_bucket)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [workspaceId, uploaderId, String(filename).slice(0, 255), mimeType || 'application/octet-stream', size, stored.key, stored.bucket, checksum, dims?.width ?? null, dims?.height ?? null, thumbKey, thumbBucket]
  );
  return row;
}

function attachRowArgs(msgId, file) {
  return [
    msgId,
    file.id,
    file.filename,
    file.mime_type,
    file.size,
    `/files/${file.id}`,
    file.thumb_storage_key ? `/files/${file.id}/thumb` : '',
    file.width ?? null,
    file.height ?? null,
  ];
}

// Access rule (Slack parity): workspace member + if attached, channel/DM access.
export async function fileAccess(fileId, userId) {
  const file = await getOne('SELECT * FROM files WHERE id = $1', [fileId]);
  if (!file) throw Object.assign(new Error('File not found'), { status: 404, code: 'NOT_FOUND' });
  const wsMember = await getOne('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [file.workspace_id, userId]);
  if (!wsMember) throw Object.assign(new Error('Not a workspace member'), { status: 403, code: 'FORBIDDEN' });
  if (file.message_id) {
    const msg = await getOne('SELECT channel_id, dm_conversation_id FROM messages WHERE id = $1', [file.message_id]);
    if (msg?.dm_conversation_id) {
      const dm = await getOne('SELECT 1 FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2', [msg.dm_conversation_id, userId]);
      if (!dm) throw Object.assign(new Error('Conversation not found'), { status: 403, code: 'FORBIDDEN' });
    } else if (msg?.channel_id) {
      const ch = await getOne('SELECT is_private FROM channels WHERE id = $1', [msg.channel_id]);
      if (ch?.is_private) {
        const cm = await getOne('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [msg.channel_id, userId]);
        if (!cm) throw Object.assign(new Error('Private channel'), { status: 403, code: 'FORBIDDEN' });
      }
    }
  }
  return { file, wsRole: wsMember.role };
}

async function requireWorkspaceMember(wid, userId) {
  const ws = await getOne('SELECT * FROM workspaces WHERE id = $1', [wid]);
  if (!ws) throw Object.assign(new Error('Workspace not found'), { status: 404, code: 'NOT_FOUND' });
  const member = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [ws.id, userId]);
  if (!member) throw Object.assign(new Error('Not a workspace member'), { status: 403, code: 'FORBIDDEN' });
  return ws;
}

// POST /workspaces/:wid/files — multipart upload (proxied MVP per plan).
filesRouter.post('/workspaces/:wid/files', requireAuth, async (req, res, next) => {
  const run = upload.array('files', 5);
  run(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: { code: status === 413 ? 'TOO_LARGE' : 'BAD_REQUEST', message: status === 413 ? `File exceeds ${maxMB()}MB` : err.message } });
    }
    try {
      const ws = await requireWorkspaceMember(req.params.wid, req.user.id);
      if (!req.files?.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No files uploaded (field: files)' } });
      const out = [];
      for (const f of req.files) {
        try {
          checkType(f.originalname, f.mimetype);
        } catch (e) {
          return res.status(e.status || 400).json({ error: { code: e.code || 'BLOCKED_TYPE', message: e.message } });
        }
        const scan = await scanFile(f.buffer, f.mimetype);
        if (!scan.clean) return res.status(400).json({ error: { code: 'BLOCKED_TYPE', message: 'File rejected by scanner' } });
        const row = await storeBuffer({
          workspaceId: ws.id,
          uploaderId: req.user.id,
          filename: f.originalname,
          mimeType: f.mimetype || 'application/octet-stream',
          buffer: f.buffer,
          size: f.size,
        });
        out.push(publicFile(row));
      }
      res.status(201).json({ files: out });
    } catch (e) {
      next(e);
    }
  });
});

// POST /workspaces/:wid/files/presign — direct-upload flow (plan 07 presigned PUT).
// Body {filename, mimeType?, size?} -> {file, uploadUrl, expiresIn}.
// Client PUTs bytes to uploadUrl, then POST /files/:id/confirm.
filesRouter.post('/workspaces/:wid/files/presign', requireAuth, async (req, res, next) => {
  try {
    const ws = await requireWorkspaceMember(req.params.wid, req.user.id);
    const { filename, mimeType, size } = validate(filePresignSchema, req.body || {});
    try {
      checkType(filename, mimeType);
    } catch (e) {
      return res.status(e.status || 400).json({ error: { code: e.code || 'BLOCKED_TYPE', message: e.message } });
    }
    if (size && size > maxMB() * 1024 * 1024) {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: `File exceeds ${maxMB()}MB` } });
    }
    const key = storageKey(ws.id, filename);
    const mime = mimeType || 'application/octet-stream';
    const { uploadUrl, expiresIn, bucket } = await presignPut(key, mime);
    const row = await getOne(
      `INSERT INTO files(workspace_id, uploader_id, filename, mime_type, size, storage_key, bucket, checksum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ws.id, req.user.id, String(filename).slice(0, 255), mime, size || 0, key, bucket, null]
    );
    res.status(201).json({ file: publicFile(row), uploadUrl, expiresIn });
  } catch (e) {
    next(e);
  }
});

// POST /files/:id/confirm — verify direct upload landed, extract dims + thumb.
filesRouter.post('/files/:id/confirm', requireAuth, async (req, res, next) => {
  try {
    const { file } = await fileAccess(req.params.id, req.user.id);
    if (file.uploader_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only uploader can confirm' } });
    }
    if (file.message_id) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'File already attached' } });
    let head;
    try {
      head = await headObject(file.storage_key);
    } catch {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Upload not found in storage — PUT bytes first' } });
    }
    if (head.size > maxMB() * 1024 * 1024) {
      await deleteObject(file.storage_key).catch(() => {});
      await query('DELETE FROM files WHERE id = $1', [file.id]);
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: `File exceeds ${maxMB()}MB` } });
    }
    // Pull bytes once to checksum + thumbnail (async job inline for MVP).
    const obj = await getObject(file.storage_key);
    const chunks = [];
    for await (const c of obj.body) chunks.push(c);
    const buffer = Buffer.concat(chunks);
    const dims = await imageDims(buffer, file.mime_type);
    let thumbKey = null;
    let thumbBucket = null;
    const thumb = await makeThumb(buffer, file.mime_type).catch(() => null);
    if (thumb) {
      const tst = await putObject(`${file.storage_key}.thumb.jpg`, thumb.buffer, thumb.mimeType);
      thumbKey = tst.key;
      thumbBucket = tst.bucket;
    }
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const updated = await getOne(
      `UPDATE files SET size = $2, checksum = $3, width = $4, height = $5, thumb_storage_key = $6, thumb_bucket = $7 WHERE id = $1 RETURNING *`,
      [file.id, head.size || buffer.length, checksum, dims?.width ?? null, dims?.height ?? null, thumbKey, thumbBucket]
    );
    res.json({ file: publicFile(updated) });
  } catch (e) {
    next(e);
  }
});

function sendStream(res, file, body, { download = false } = {}) {
  res.setHeader('Content-Type', file.mime_type);
  if (file.size) res.setHeader('Content-Length', file.size);
  const disp = download ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disp}; filename="${file.filename.replace(/"/g, '')}"`);
  body.pipe(res);
}

// GET /files/:id — perm-checked. ?mode=redirect -> 302 signed URL, ?download=1 attachment.
filesRouter.get('/files/:id', requireAuth, async (req, res, next) => {
  try {
    const { file } = await fileAccess(req.params.id, req.user.id);
    if (req.query.mode === 'redirect') {
      const url = await signedUrl(file.storage_key);
      return res.redirect(302, url);
    }
    const download = req.query.download === '1' || req.query.download === 'true';
    const obj = await getObject(file.storage_key);
    sendStream(res, file, obj.body, { download });
  } catch (e) {
    next(e);
  }
});

// GET /files/:id/thumb — 320px preview (?mode=redirect supported).
filesRouter.get('/files/:id/thumb', requireAuth, async (req, res, next) => {
  try {
    const { file } = await fileAccess(req.params.id, req.user.id);
    if (!file.thumb_storage_key) {
      // No thumb (non-image): fall back to original for client simplicity.
      if (req.query.mode === 'redirect') return res.redirect(302, await signedUrl(file.storage_key));
      const obj = await getObject(file.storage_key);
      return sendStream(res, file, obj.body);
    }
    if (req.query.mode === 'redirect') {
      return res.redirect(302, await signedUrl(file.thumb_storage_key));
    }
    const obj = await getObject(file.thumb_storage_key);
    res.setHeader('Content-Type', 'image/jpeg');
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
    if (file.thumb_storage_key) await deleteObject(file.thumb_storage_key).catch(() => {});
    await query('DELETE FROM files WHERE id = $1', [file.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /files/:id/share {channelId, content?, parentMessageId?} — post as attachment.
filesRouter.post('/files/:id/share', requireAuth, async (req, res, next) => {
  try {
    const { file } = await fileAccess(req.params.id, req.user.id);
    const { channelId, content, parentMessageId } = validate(fileShareSchema, req.body || {});
    const ch = await getOne('SELECT * FROM channels WHERE id = $1 AND workspace_id = $2', [channelId, file.workspace_id]);
    if (!ch) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    const cm = await getOne('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [channelId, req.user.id]);
    if (!cm) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Join the channel to post' } });
    if (ch.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Channel is archived' } });
    if (parentMessageId) {
      const parent = await getOne('SELECT id, channel_id FROM messages WHERE id = $1 AND deleted_at IS NULL', [parentMessageId]);
      if (!parent || parent.channel_id !== channelId) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Parent message not in this channel' } });
      }
    }
    const text = (content || file.filename).slice(0, 8000) || file.filename;
    const msg = await getOne(
      `INSERT INTO messages(workspace_id, channel_id, sender_id, parent_message_id, content) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [file.workspace_id, channelId, req.user.id, parentMessageId || null, text]
    );
    await query('UPDATE files SET message_id = $1 WHERE id = $2', [msg.id, file.id]);
    await query(
      'INSERT INTO message_attachments(message_id, file_id, filename, mime_type, size, url, thumb_url, width, height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      attachRowArgs(msg.id, file)
    );
    const emailIds = await resolveMentionEmails(file.workspace_id, text);
    const all = emailIds.filter((id) => id !== req.user.id);
    for (const uid of all) {
      await query('INSERT INTO message_mentions(message_id, mentioned_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [msg.id, uid]);
      await notifyUser(uid, file.workspace_id, 'mention', msg.id);
    }
    // Thread-reply notification parity with normal sends.
    if (parentMessageId) {
      const parent = await getOne('SELECT sender_id FROM messages WHERE id = $1', [parentMessageId]);
      if (parent && parent.sender_id !== req.user.id && !all.includes(parent.sender_id)) {
        await notifyUser(parent.sender_id, file.workspace_id, 'thread_reply', msg.id);
      }
    }
    const full = await getMessage(msg.id);
    const out = serializeMessage(full, { mentionIds: all, attachments: await loadAttachments([msg.id]) });
    await publish({ type: 'message.created', payload: { message: out } }, [`channel:${channelId}`]);
    res.status(201).json({ message: out });
  } catch (e) {
    next(e);
  }
});
