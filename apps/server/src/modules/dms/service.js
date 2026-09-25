import { getOne, query } from '../../database/db.js';
import { serializeMessage, getMessage } from '../messages/service.js';

// Shared DM helpers. DM messages live in `messages` with channel_id NULL +
// dm_conversation_id set (see 010_dms.sql); threads/reactions/mentions/
// attachments loaders all key on message id so they work unchanged.

export function publicDM(row, extra = {}) {
  const memberIds = row.member_ids || [];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    isGroup: row.is_group,
    name: row.name,
    memberIds,
    memberCount: memberIds.length,
    lastMessage: row.last_message || null,
    unreadCount: row.unread_count !== undefined ? Number(row.unread_count) : undefined,
    updatedAt: row.updated_at || row.created_at,
    ...extra,
  };
}

// Enrich a serialized channel-style message with its DM home.
export function withDmHome(serialized, dmId) {
  return { ...serialized, channelId: null, dmConversationId: dmId };
}

export async function getDmConversation(id) {
  return getOne('SELECT * FROM direct_conversations WHERE id = $1', [id]);
}

// Membership gate: caller must be a workspace member AND a DM member.
// Attaches req.dm (+ member row). Non-members get 403/404 (Slack hides).
export async function requireDm(req, res, next) {
  try {
    const dm = await getDmConversation(req.params.id);
    if (!dm) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const wsMember = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [dm.workspace_id, req.user.id]);
    if (!wsMember) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    const member = await getOne('SELECT * FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2', [dm.id, req.user.id]);
    if (!member) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    req.dm = dm;
    req.dmMember = member;
    next();
  } catch (e) {
    next(e);
  }
}

// DM access for a message id (mirrors accessMessage for channels).
export async function accessDmMessage(messageId, userId) {
  const message = await getMessage(messageId);
  if (!message) throw Object.assign(new Error('Message not found'), { status: 404, code: 'NOT_FOUND' });
  if (!message.dm_conversation_id) throw Object.assign(new Error('Not a DM message'), { status: 400, code: 'BAD_REQUEST' });
  const dm = await getDmConversation(message.dm_conversation_id);
  const wsMember = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [dm.workspace_id, userId]);
  if (!wsMember) throw Object.assign(new Error('Not a workspace member'), { status: 403, code: 'FORBIDDEN' });
  const member = await getOne('SELECT * FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2', [dm.id, userId]);
  if (!member) throw Object.assign(new Error('Conversation not found'), { status: 404, code: 'NOT_FOUND' });
  return { message, dm };
}

// Idempotency: exact same non-group member set (order-insensitive) reuses the row.
export async function findDirectPair(workspaceId, userIds) {
  const sorted = [...new Set(userIds)].sort();
  const r = await query(
    `SELECT dc.* FROM direct_conversations dc
     WHERE dc.workspace_id = $1 AND dc.is_group = false
       AND (SELECT COUNT(*) FROM direct_conversation_members m WHERE m.conversation_id = dc.id) = $2
       AND NOT EXISTS (
         SELECT 1 FROM direct_conversation_members m WHERE m.conversation_id = dc.id AND NOT (m.user_id = ANY($3))
       )`,
    [workspaceId, sorted.length, sorted]
  );
  return r.rows[0] || null;
}

export async function dmMemberList(dmId) {
  const r = await query(
    `SELECT m.*, u.display_name, u.avatar_url, u.email, u.status FROM direct_conversation_members m
     JOIN users u ON u.id = m.user_id WHERE m.conversation_id = $1 ORDER BY u.display_name`,
    [dmId]
  );
  return r.rows.map((m) => ({
    userId: m.user_id,
    displayName: m.display_name,
    avatarUrl: m.avatar_url,
    email: m.email,
    status: m.status,
    lastReadAt: m.last_read_at,
    joinedAt: m.joined_at,
  }));
}

// Serialize a DM message row fully (reactions/mentions/attachments/buttons included).
export async function serializeDmMessage(msgId, meId, dmId) {
  const { loadReactions, loadMentions, loadAttachments, withButtons } = await import('../messages/service.js');
  const full = await getMessage(msgId);
  const [reactions, mentions, attachments] = await Promise.all([
    loadReactions([msgId], meId), loadMentions([msgId]), loadAttachments([msgId]),
  ]);
  const [out] = await withButtons([withDmHome(serializeMessage(full, { reactions, mentionIds: mentions[msgId] || [], attachments }), dmId)]);
  return out;
}
