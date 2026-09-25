import { getOne, query } from '../../database/db.js';

// Serialize a message row (+ sender join) into the API shape.
export function serializeMessage(row, { reactions = [], mentionIds = [] } = {}) {
  const deleted = Boolean(row.deleted_at);
  const counts = {};
  const mine = new Set();
  for (const r of reactions) {
    if (r.message_id !== row.id) continue;
    counts[r.emoji] = Number(r.n || 0);
    if (r.mine) mine.add(r.emoji);
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    parentMessageId: row.parent_message_id,
    sender: {
      id: row.sender_id,
      displayName: row.sender_name,
      avatarUrl: row.sender_avatar,
    },
    content: deleted ? null : row.content,
    messageType: row.message_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: Number(row.edit_count || 0) > 0,
    deleted,
    replyCount: Number(row.reply_count || 0),
    reactions: Object.entries(counts).map(([emoji, count]) => ({ emoji, count, me: mine.has(emoji) })),
    mentions: mentionIds,
  };
}

export async function loadReactions(messageIds, meId) {
  if (!messageIds.length) return [];
  const r = await query(
    `SELECT message_id, emoji, COUNT(*)::int AS n, bool_or(user_id = $2) AS mine
     FROM message_reactions WHERE message_id = ANY($1) GROUP BY message_id, emoji`,
    [messageIds, meId]
  );
  return r.rows;
}

export async function loadMentions(messageIds) {
  if (!messageIds.length) return {};
  const r = await query('SELECT message_id, mentioned_user_id FROM message_mentions WHERE message_id = ANY($1)', [messageIds]);
  const map = {};
  for (const row of r.rows) {
    (map[row.message_id] = map[row.message_id] || []).push(row.mentioned_user_id);
  }
  return map;
}

const MESSAGE_SELECT = `
  SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
    (SELECT COUNT(*) FROM messages r WHERE r.parent_message_id = m.id AND r.deleted_at IS NULL) AS reply_count,
    (SELECT COUNT(*) FROM message_edits e WHERE e.message_id = m.id) AS edit_count
  FROM messages m JOIN users u ON u.id = m.sender_id`;

export async function getMessage(id) {
  return getOne(`${MESSAGE_SELECT} WHERE m.id = $1`, [id]);
}

// Loads a message + enforces channel access for a user.
// Returns { message, channel, wsRole, chRole } or throws { status }.
export async function accessMessage(messageId, userId) {
  const message = await getMessage(messageId);
  if (!message) throw Object.assign(new Error('Message not found'), { status: 404, code: 'NOT_FOUND' });
  const channel = await getOne('SELECT * FROM channels WHERE id = $1', [message.channel_id]);
  const wsMember = await getOne('SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [channel.workspace_id, userId]);
  if (!wsMember) throw Object.assign(new Error('Not a workspace member'), { status: 403, code: 'FORBIDDEN' });
  const chMember = await getOne('SELECT * FROM channel_members WHERE channel_id = $1 AND user_id = $2', [channel.id, userId]);
  if (channel.is_private && !chMember) throw Object.assign(new Error('Private channel'), { status: 403, code: 'FORBIDDEN' });
  return { message, channel, wsRole: wsMember.role, chRole: chMember ? chMember.role : null };
}

// @email mentions in content -> workspace member ids.
export async function resolveMentionEmails(workspaceId, content) {
  // Note: Array.from (not iterator.map) — Iterator Helpers don't exist on Node 20.
  const emails = [...new Set(Array.from(content.matchAll(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g), (m) => m[1].toLowerCase()))];
  if (!emails.length) return [];
  const r = await query(
    `SELECT u.id FROM users u JOIN workspace_members wm ON wm.user_id = u.id
     WHERE wm.workspace_id = $1 AND lower(u.email) = ANY($2)`,
    [workspaceId, emails]
  );
  return r.rows.map((x) => x.id);
}

export async function filterWorkspaceMembers(workspaceId, userIds) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  const r = await query(
    'SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = ANY($2)',
    [workspaceId, ids]
  );
  return r.rows.map((x) => x.user_id);
}
