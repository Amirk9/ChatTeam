import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { requireWorkspace } from '../workspaces/permissions.js';
import { requireDm, publicDM, findDirectPair, dmMemberList, withDmHome } from './service.js';
import {
  serializeMessage,
  getMessage,
  loadReactions,
  loadMentions,
  loadAttachments,
  resolveMentionEmails,
  filterWorkspaceMembers,
} from '../messages/service.js';
import {
  dmCreateSchema,
  dmPatchSchema,
  dmMemberAddSchema,
  dmMessageCreateSchema,
  dmReadSchema,
  dmMessagesQuerySchema,
  validate,
} from '@teamchat/validation';
import { publish } from '../../websocket/index.js';
import { getIO } from '../../websocket/index.js';
import { notifyUser } from '../notifications/routes.js';

export const dmsRouter = Router();

// Join every connected socket of the given users to a DM room (live join
// without reconnect — Slack adds the conversation instantly).
function joinDmRoom(userIds, dmId) {
  try {
    const io = getIO();
    if (!io) return;
    for (const id of userIds) io.in(`user:${id}`).socketsJoin(`dm:${dmId}`);
  } catch {}
}

function dmDisplayName(memberRows) {
  return memberRows.map((m) => m.display_name.split(' ')[0]).slice(0, 4).join(', ');
}

// POST /workspaces/:wid/dms {userIds, name?} — idempotent for same 1-1 pair.
dmsRouter.post('/workspaces/:wid/dms', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const { userIds, name } = validate(dmCreateSchema, req.body);
    const others = [...new Set(userIds)].filter((id) => id !== req.user.id);
    if (!others.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invite at least one other member' } });
    // All invitees must be workspace members (Slack: DMs stay inside the workspace).
    const members = await query('SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = ANY($2)', [req.workspace.id, others]);
    if (members.rows.length !== others.length) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'All DM members must belong to the workspace' } });
    }
    const allIds = [req.user.id, ...others];
    const isPair = allIds.length === 2 && !name;
    if (isPair) {
      const existing = await findDirectPair(req.workspace.id, allIds);
      if (existing) return res.json({ conversation: await fullDm(existing.id, req.user.id), reused: true });
    }
    const isGroup = allIds.length > 2 || Boolean(name);
    let dmName = name || null;
    const dm = await getOne(
      'INSERT INTO direct_conversations(workspace_id, is_group, name, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.workspace.id, isGroup, dmName, req.user.id]
    );
    for (const uid of allIds) {
      await query('INSERT INTO direct_conversation_members(conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [dm.id, uid]);
    }
    if (!dmName && isGroup) {
      const rows = await query('SELECT display_name FROM users WHERE id = ANY($1)', [allIds]);
      dmName = dmDisplayName(rows.rows);
      await query('UPDATE direct_conversations SET name = $2 WHERE id = $1', [dm.id, dmName]);
      dm.name = dmName;
    }
    const out = await fullDm(dm.id, req.user.id);
    joinDmRoom(allIds, dm.id);
    await publish({ type: 'dm.created', payload: { conversation: out } }, allIds.map((id) => `user:${id}`));
    res.status(201).json({ conversation: out, reused: false });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:wid/dms — mine with last message + unread (Slack sidebar).
dmsRouter.get('/workspaces/:wid/dms', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT dc.*, COALESCE(mids.member_ids, '{}') AS member_ids,
        (SELECT COUNT(*)::int FROM messages m
          WHERE m.dm_conversation_id = dc.id AND m.deleted_at IS NULL AND m.sender_id <> $2
            AND m.created_at > COALESCE((SELECT last_read_at FROM direct_conversation_members dcm WHERE dcm.conversation_id = dc.id AND dcm.user_id = $2), '-infinity')) AS unread_count,
        (SELECT max(m.created_at) FROM messages m WHERE m.dm_conversation_id = dc.id) AS updated_at
       FROM direct_conversations dc
       LEFT JOIN LATERAL (SELECT array_agg(m.user_id) AS member_ids FROM direct_conversation_members m WHERE m.conversation_id = dc.id) mids ON true
       WHERE dc.workspace_id = $1
         AND EXISTS (SELECT 1 FROM direct_conversation_members m WHERE m.conversation_id = dc.id AND m.user_id = $2)
       ORDER BY updated_at DESC NULLS LAST, dc.created_at DESC`,
      [req.workspace.id, req.user.id]
    );
    const list = [];
    for (const row of r.rows) {
      const last = await getOne(
        `SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar, 0 AS reply_count, 0 AS edit_count
         FROM messages m JOIN users u ON u.id = m.sender_id
         WHERE m.dm_conversation_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC, m.id DESC LIMIT 1`,
        [row.id]
      );
      list.push(publicDM(row, {
        lastMessage: last ? withDmHome(serializeMessage(last), row.id) : null,
      }));
    }
    res.json({ conversations: list });
  } catch (e) {
    next(e);
  }
});

// GET /dms/:id — single conversation (deep links).
dmsRouter.get('/dms/:id', requireAuth, requireDm, async (req, res, next) => {
  try {
    res.json({ conversation: await fullDm(req.dm.id, req.user.id) });
  } catch (e) {
    next(e);
  }
});

// GET /dms/:id/members — members + read receipts (who read up to X).
dmsRouter.get('/dms/:id/members', requireAuth, requireDm, async (req, res, next) => {
  try {
    res.json({ members: await dmMemberList(req.dm.id) });
  } catch (e) {
    next(e);
  }
});

// PATCH /dms/:id {name} — group rename only (1-1 has no name).
dmsRouter.patch('/dms/:id', requireAuth, requireDm, async (req, res, next) => {
  try {
    if (!req.dm.is_group) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: '1-1 conversations cannot be renamed' } });
    const { name } = validate(dmPatchSchema, req.body);
    const updated = await getOne('UPDATE direct_conversations SET name = $2 WHERE id = $1 RETURNING *', [req.dm.id, name]);
    const out = await fullDm(updated.id, req.user.id);
    await publish({ type: 'dm.updated', payload: { conversation: out } }, [`dm:${req.dm.id}`]);
    res.json({ conversation: out });
  } catch (e) {
    next(e);
  }
});

// POST /dms/:id/members {userId} — group add (member must be in workspace).
dmsRouter.post('/dms/:id/members', requireAuth, requireDm, async (req, res, next) => {
  try {
    if (!req.dm.is_group) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot add members to a 1-1 conversation' } });
    const { userId } = validate(dmMemberAddSchema, req.body);
    const wsMember = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [req.dm.workspace_id, userId]);
    if (!wsMember) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'User must belong to the workspace' } });
    await query('INSERT INTO direct_conversation_members(conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.dm.id, userId]);
    const out = await fullDm(req.dm.id, req.user.id);
    joinDmRoom([userId], req.dm.id);
    await publish({ type: 'dm.updated', payload: { conversation: out } }, [`dm:${req.dm.id}`, `user:${userId}`]);
    res.status(201).json({ conversation: out });
  } catch (e) {
    next(e);
  }
});

// DELETE /dms/:id/members/:uid — group remove (members can remove anyone incl. self = leave).
dmsRouter.delete('/dms/:id/members/:uid', requireAuth, requireDm, async (req, res, next) => {
  try {
    if (!req.dm.is_group) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot remove members from a 1-1 conversation' } });
    await query('DELETE FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2', [req.dm.id, req.params.uid]);
    const out = await fullDm(req.dm.id, req.user.id);
    await publish({ type: 'dm.updated', payload: { conversation: out } }, [`dm:${req.dm.id}`, `user:${req.params.uid}`]);
    res.json({ conversation: out });
  } catch (e) {
    next(e);
  }
});

// GET /dms/:id/messages — keyset pagination (roots only, like channels).
dmsRouter.get('/dms/:id/messages', requireAuth, requireDm, async (req, res, next) => {
  try {
    const { limit, before } = validate(dmMessagesQuerySchema, req.query);
    let cursorClause = '';
    const params = [req.dm.id];
    if (before) {
      const cursor = await getOne('SELECT created_at, id FROM messages WHERE id = $1 AND dm_conversation_id = $2', [before, req.dm.id]);
      if (!cursor) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Unknown cursor' } });
      params.push(cursor.created_at, cursor.id);
      cursorClause = `AND (m.created_at, m.id) < ($${params.length - 1}, $${params.length})`;
    }
    params.push(limit + 1);
    const r = await query(
      `SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
        (SELECT COUNT(*) FROM messages x WHERE x.parent_message_id = m.id AND x.deleted_at IS NULL) AS reply_count,
        (SELECT COUNT(*) FROM message_edits e WHERE e.message_id = m.id) AS edit_count
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.dm_conversation_id = $1 AND m.parent_message_id IS NULL ${cursorClause}
       ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}`,
      params
    );
    const hasMore = r.rows.length > limit;
    const page = (hasMore ? r.rows.slice(0, limit) : r.rows).reverse();
    const ids = page.map((m) => m.id);
    const [reactions, mentions, attachments] = await Promise.all([loadReactions(ids, req.user.id), loadMentions(ids), loadAttachments(ids)]);
    res.json({
      messages: page.map((m) => withDmHome(serializeMessage(m, { reactions, mentionIds: mentions[m.id] || [], attachments }), req.dm.id)),
      nextCursor: hasMore ? page[0].id : null,
    });
  } catch (e) {
    next(e);
  }
});

// POST /dms/:id/messages — send (threads, mentions, attachments, receipts).
dmsRouter.post('/dms/:id/messages', requireAuth, requireDm, async (req, res, next) => {
  try {
    const { content, parentMessageId, mentions, attachmentIds } = validate(dmMessageCreateSchema, req.body);
    if (parentMessageId) {
      const parent = await getOne('SELECT id, dm_conversation_id FROM messages WHERE id = $1 AND deleted_at IS NULL', [parentMessageId]);
      if (!parent || parent.dm_conversation_id !== req.dm.id) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Parent message not in this conversation' } });
      }
    }
    const msg = await getOne(
      `INSERT INTO messages(workspace_id, channel_id, dm_conversation_id, sender_id, parent_message_id, content)
       VALUES ($1, NULL, $2, $3, $4, $5) RETURNING *`,
      [req.dm.workspace_id, req.dm.id, req.user.id, parentMessageId || null, content]
    );
    const emailIds = await resolveMentionEmails(req.dm.workspace_id, content);
    const validIds = await filterWorkspaceMembers(req.dm.workspace_id, mentions);
    const all = [...new Set([...emailIds, ...validIds])].filter((id) => id !== req.user.id);
    for (const uid of all) {
      await query('INSERT INTO message_mentions(message_id, mentioned_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [msg.id, uid]);
    }
    for (const fid of [...new Set(attachmentIds)]) {
      const f = await getOne('SELECT * FROM files WHERE id = $1 AND uploader_id = $2 AND workspace_id = $3 AND message_id IS NULL', [fid, req.user.id, req.dm.workspace_id]);
      if (!f) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Unknown or already-attached file' } });
      await query('UPDATE files SET message_id = $1 WHERE id = $2', [msg.id, fid]);
      await query('INSERT INTO message_attachments(message_id, file_id, filename, mime_type, size, url, thumb_url, width, height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [msg.id, f.id, f.filename, f.mime_type, f.size, `/files/${f.id}`, f.thumb_storage_key ? `/files/${f.id}/thumb` : '', f.width, f.height]);
    }
    const full = await getMessage(msg.id);
    const attachments = await loadAttachments([msg.id]);
    const out = withDmHome(serializeMessage(full, { mentionIds: all, attachments }), req.dm.id);
    await publish({ type: 'dm.message.created', payload: { message: out } }, [`dm:${req.dm.id}`]);
    // Slack parity: every DM notifies the other members; mentions/thread notify too.
    const others = (await dmMemberList(req.dm.id)).map((m) => m.userId).filter((id) => id !== req.user.id);
    for (const uid of others) {
      await notifyUser(uid, req.dm.workspace_id, 'dm', msg.id);
    }
    for (const uid of all.filter((id) => !others.includes(id))) {
      await notifyUser(uid, req.dm.workspace_id, 'mention', msg.id);
    }
    if (parentMessageId) {
      const parent = await getOne('SELECT sender_id FROM messages WHERE id = $1', [parentMessageId]);
      if (parent && parent.sender_id !== req.user.id && !all.includes(parent.sender_id) && !others.includes(parent.sender_id)) {
        await notifyUser(parent.sender_id, req.dm.workspace_id, 'thread_reply', msg.id);
      }
    }
    res.status(201).json({ message: out });
  } catch (e) {
    next(e);
  }
});

// POST /dms/:id/read — advance read marker (read receipts).
dmsRouter.post('/dms/:id/read', requireAuth, requireDm, async (req, res, next) => {
  try {
    const { lastReadMessageId } = validate(dmReadSchema, req.body);
    const msg = await getOne('SELECT id FROM messages WHERE id = $1 AND dm_conversation_id = $2', [lastReadMessageId, req.dm.id]);
    if (!msg) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Message not in this conversation' } });
    await query(
      `UPDATE direct_conversation_members SET last_read_at = GREATEST(COALESCE(last_read_at, '-infinity'), now())
       WHERE conversation_id = $1 AND user_id = $2`,
      [req.dm.id, req.user.id]
    );
    await publish({ type: 'dm.read', payload: { dmId: req.dm.id, userId: req.user.id } }, [`dm:${req.dm.id}`]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

async function fullDm(dmId, meId) {
  const row = await getOne(
    `SELECT dc.*, COALESCE(mids.member_ids, '{}') AS member_ids,
      (SELECT COUNT(*)::int FROM messages m WHERE m.dm_conversation_id = dc.id AND m.deleted_at IS NULL AND m.sender_id <> $2
        AND m.created_at > COALESCE((SELECT last_read_at FROM direct_conversation_members dcm WHERE dcm.conversation_id = dc.id AND dcm.user_id = $2), '-infinity')) AS unread_count,
      (SELECT max(m.created_at) FROM messages m WHERE m.dm_conversation_id = dc.id) AS updated_at
     FROM direct_conversations dc
     LEFT JOIN LATERAL (SELECT array_agg(m.user_id) AS member_ids FROM direct_conversation_members m WHERE m.conversation_id = dc.id) mids ON true
     WHERE dc.id = $1`,
    [dmId, meId]
  );
  const members = await dmMemberList(dmId);
  return { ...publicDM(row), members };
}
