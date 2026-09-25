import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { hasPermission } from '../workspaces/permissions.js';
import { requireChannel } from '../channels/service.js';
import {
  serializeMessage,
  getMessage,
  accessMessage,
  loadReactions,
  loadMentions,
  loadAttachments,
  resolveMentionEmails,
  filterWorkspaceMembers,
} from './service.js';
import {
  messageCreateSchema,
  messagePatchSchema,
  reactionSchema,
  readSchema,
  messagesQuerySchema,
  validate,
} from '@teamchat/validation';
import { publish } from '../../websocket/index.js';
import { notifyUser } from '../notifications/routes.js';

export const messagesRouter = Router();

const EDIT_WINDOW_MS = 24 * 3600 * 1000;

// POST /channels/:id/messages — members only (Slack: join to post).
messagesRouter.post('/channels/:id/messages', requireAuth, requireChannel, async (req, res, next) => {
  try {
    if (!req.channelRole) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Join the channel to post' } });
    if (req.channel.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Channel is archived' } });
    const { content, parentMessageId, mentions, attachmentIds } = validate(messageCreateSchema, req.body);
    if (parentMessageId) {
      const parent = await getOne('SELECT id, channel_id FROM messages WHERE id = $1 AND deleted_at IS NULL', [parentMessageId]);
      if (!parent || parent.channel_id !== req.channel.id) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Parent message not in this channel' } });
      }
    }
    const msg = await getOne(
      `INSERT INTO messages(workspace_id, channel_id, sender_id, parent_message_id, content)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.channel.workspace_id, req.channel.id, req.user.id, parentMessageId || null, content]
    );
    const emailIds = await resolveMentionEmails(req.channel.workspace_id, content);
    const validIds = await filterWorkspaceMembers(req.channel.workspace_id, mentions);
    const all = [...new Set([...emailIds, ...validIds])].filter((id) => id !== req.user.id);
    for (const uid of all) {
      await query('INSERT INTO message_mentions(message_id, mentioned_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [msg.id, uid]);
    }
    // Link sender-owned, unattached files from this workspace (Slack attach flow).
    for (const fid of [...new Set(attachmentIds)]) {
      const f = await getOne('SELECT * FROM files WHERE id = $1 AND uploader_id = $2 AND workspace_id = $3 AND message_id IS NULL', [fid, req.user.id, req.channel.workspace_id]);
      if (!f) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Unknown or already-attached file' } });
      await query('UPDATE files SET message_id = $1 WHERE id = $2', [msg.id, fid]);
      await query('INSERT INTO message_attachments(message_id, file_id, filename, mime_type, size, url, thumb_url, width, height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [msg.id, f.id, f.filename, f.mime_type, f.size, `/files/${f.id}`, f.thumb_storage_key ? `/files/${f.id}/thumb` : '', f.width, f.height]);
    }
    const full = await getMessage(msg.id);
    const attachments = await loadAttachments([msg.id]);
    const out = serializeMessage(full, { mentionIds: all, attachments });
    await publish({ type: 'message.created', payload: { message: out } }, [`channel:${req.channel.id}`]);
    // Notifications: mentions + thread replies (Slack rules).
    for (const uid of all) {
      await notifyUser(uid, req.channel.workspace_id, 'mention', msg.id);
    }
    if (parentMessageId) {
      const parent = await getOne('SELECT sender_id FROM messages WHERE id = $1', [parentMessageId]);
      if (parent && parent.sender_id !== req.user.id && !all.includes(parent.sender_id)) {
        await notifyUser(parent.sender_id, req.channel.workspace_id, 'thread_reply', msg.id);
      }
    }
    res.status(201).json({ message: out });
  } catch (e) {
    next(e);
  }
});

// GET /channels/:id/messages — keyset pagination (Slack-style infinite scroll).
messagesRouter.get('/channels/:id/messages', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const { limit, before } = validate(messagesQuerySchema, req.query);
    let cursorClause = '';
    const params = [req.channel.id];
    if (before) {
      const cursor = await getOne('SELECT created_at, id FROM messages WHERE id = $1 AND channel_id = $2', [before, req.channel.id]);
      if (!cursor) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Unknown cursor' } });
      params.push(cursor.created_at, cursor.id);
      cursorClause = `AND (m.created_at, m.id) < ($${params.length - 1}, $${params.length})`;
    }
    params.push(limit + 1);
    const base = `
      SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
        (SELECT COUNT(*) FROM messages r WHERE r.parent_message_id = m.id AND r.deleted_at IS NULL) AS reply_count,
        (SELECT COUNT(*) FROM message_edits e WHERE e.message_id = m.id) AS edit_count
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.channel_id = $1 AND m.parent_message_id IS NULL ${cursorClause}
      ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}`;
    const r = await query(base, params);
    const hasMore = r.rows.length > limit;
    const page = (hasMore ? r.rows.slice(0, limit) : r.rows).reverse();
    const ids = page.map((m) => m.id);
    const [reactions, mentions, attachments] = await Promise.all([loadReactions(ids, req.user.id), loadMentions(ids), loadAttachments(ids)]);
    res.json({
      messages: page.map((m) => serializeMessage(m, { reactions, mentionIds: mentions[m.id] || [], attachments })),
      nextCursor: hasMore ? page[0].id : null,
    });
  } catch (e) {
    next(e);
  }
});

// GET /messages/:id/thread — root + chronological replies.
messagesRouter.get('/messages/:id/thread', requireAuth, async (req, res, next) => {
  try {
    const { message, channel } = await accessMessage(req.params.id, req.user.id);
    const rootId = message.parent_message_id || message.id;
    const root = message.parent_message_id ? await getMessage(rootId) : message;
    if (!root) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Thread root not found' } });
    const r = await query(
      `SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar, 0 AS reply_count,
        (SELECT COUNT(*) FROM message_edits e WHERE e.message_id = m.id) AS edit_count
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.parent_message_id = $1 ORDER BY m.created_at ASC, m.id ASC`,
      [rootId]
    );
    const all = [root, ...r.rows];
    const ids = all.map((m) => m.id);
    const [reactions, mentions, attachments] = await Promise.all([loadReactions(ids, req.user.id), loadMentions(ids), loadAttachments(ids)]);
    res.json({
      channelId: channel.id,
      messages: all.map((m) => serializeMessage(m, { reactions, mentionIds: mentions[m.id] || [], attachments })),
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /messages/:id — author only, 24h window, history kept.
messagesRouter.patch('/messages/:id', requireAuth, async (req, res, next) => {
  try {
    const { message, channel } = await accessMessage(req.params.id, req.user.id);
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the author can edit' } });
    }
    if (message.deleted_at) return res.status(403).json({ error: { code: 'DELETED', message: 'Message is deleted' } });
    if (channel.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Channel is archived' } });
    if (Date.now() - new Date(message.created_at).getTime() > EDIT_WINDOW_MS) {
      return res.status(403).json({ error: { code: 'EDIT_WINDOW', message: 'Edit window (24h) expired' } });
    }
    const { content } = validate(messagePatchSchema, req.body);
    await query('INSERT INTO message_edits(message_id, content) VALUES ($1,$2)', [message.id, message.content]);
    const updated = await getOne('UPDATE messages SET content = $1, updated_at = now() WHERE id = $2 RETURNING *', [content, message.id]);
    const full = await getMessage(updated.id);
    const [reactions, mentions, attachments] = await Promise.all([loadReactions([full.id], req.user.id), loadMentions([full.id]), loadAttachments([full.id])]);
    const out = serializeMessage(full, { reactions, mentionIds: mentions[full.id] || [], attachments });
    await publish({ type: 'message.updated', payload: { message: out } }, [`channel:${channel.id}`]);
    res.json({ message: out });
  } catch (e) {
    next(e);
  }
});

// DELETE /messages/:id — soft delete; author or DELETE_MESSAGE holders.
messagesRouter.delete('/messages/:id', requireAuth, async (req, res, next) => {
  try {
    const { message, channel } = await accessMessage(req.params.id, req.user.id);
    if (message.deleted_at) return res.json({ ok: true });
    const isAuthor = message.sender_id === req.user.id;
    const canMod = await hasPermission(channel.workspace_id, req.user.id, 'DELETE_MESSAGE');
    if (!isAuthor && !canMod) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot delete this message' } });
    }
    await query('UPDATE messages SET deleted_at = now() WHERE id = $1', [message.id]);
    const full = await getMessage(message.id);
    await publish({ type: 'message.deleted', payload: { id: message.id, channelId: channel.id } }, [`channel:${channel.id}`]);
    res.json({ message: serializeMessage(full) });
  } catch (e) {
    next(e);
  }
});

// POST /messages/:id/reactions — idempotent toggle target.
messagesRouter.post('/messages/:id/reactions', requireAuth, async (req, res, next) => {
  try {
    const { message, channel, chRole } = await accessMessage(req.params.id, req.user.id);
    if (!chRole) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Join the channel to react' } });
    if (channel.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Channel is archived' } });
    if (message.deleted_at) return res.status(403).json({ error: { code: 'DELETED', message: 'Message is deleted' } });
    const { emoji } = validate(reactionSchema, req.body);
    await query('INSERT INTO message_reactions(message_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [message.id, req.user.id, emoji]);
    const reactions = await loadReactions([message.id], req.user.id);
    const full = await getMessage(message.id);
    await publish({ type: 'reaction.added', payload: { messageId: message.id, channelId: channel.id, emoji, userId: req.user.id } }, [`channel:${channel.id}`]);
    res.status(201).json({ message: serializeMessage(full, { reactions, attachments: await loadAttachments([message.id]) }) });
  } catch (e) {
    next(e);
  }
});

// DELETE /messages/:id/reactions?emoji= — remove own reaction.
messagesRouter.delete('/messages/:id/reactions', requireAuth, async (req, res, next) => {
  try {
    const { message, chRole } = await accessMessage(req.params.id, req.user.id);
    if (!chRole) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Join the channel first' } });
    const { emoji } = validate(reactionSchema, req.query);
    await query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [message.id, req.user.id, emoji]);
    const reactions = await loadReactions([message.id], req.user.id);
    const full = await getMessage(message.id);
    await publish({ type: 'reaction.removed', payload: { messageId: message.id, channelId: message.channel_id, emoji, userId: req.user.id } }, [`channel:${message.channel_id}`]);
    res.json({ message: serializeMessage(full, { reactions, attachments: await loadAttachments([message.id]) }) });
  } catch (e) {
    next(e);
  }
});

// POST /channels/:id/read — advance read marker; drives unread counts.
messagesRouter.post('/channels/:id/read', requireAuth, requireChannel, async (req, res, next) => {
  try {
    if (!req.channelRole) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Join the channel first' } });
    const { lastReadMessageId } = validate(readSchema, req.body);
    const msg = await getOne('SELECT id FROM messages WHERE id = $1 AND channel_id = $2', [lastReadMessageId, req.channel.id]);
    if (!msg) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Message not in this channel' } });
    // Mark = now(): everything up to this instant is read. (Using the message's
    // own timestamp would wrongly leave same-millisecond siblings unread.)
    await query(
      `UPDATE channel_members SET last_read_at = GREATEST(COALESCE(last_read_at, '-infinity'), now())
       WHERE channel_id = $1 AND user_id = $2`,
      [req.channel.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
