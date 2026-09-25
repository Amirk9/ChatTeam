import { getOne, query } from '../../database/db.js';

// Huddle helpers: calls live on a channel OR dm (exactly one, like messages).
export function publicCall(row, extra = {}) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    dmConversationId: row.dm_conversation_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    ...extra,
  };
}

export async function getCall(id) {
  return getOne('SELECT * FROM calls WHERE id = $1', [id]);
}

// Caller must belong to the call's channel/DM (Slack: huddles are private
// to the conversation). Attaches req.call.
export async function requireCall(req, res, next) {
  try {
    const call = await getCall(req.params.id);
    if (!call) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Call not found' } });
    const wsMember = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [call.workspace_id, req.user.id]);
    if (!wsMember) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    if (call.channel_id) {
      const ch = await getOne('SELECT is_private FROM channels WHERE id = $1', [call.channel_id]);
      if (ch?.is_private) {
        const cm = await getOne('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [call.channel_id, req.user.id]);
        if (!cm) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Call not found' } });
      }
    } else {
      const dm = await getOne('SELECT 1 FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2', [call.dm_conversation_id, req.user.id]);
      if (!dm) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Call not found' } });
    }
    req.call = call;
    next();
  } catch (e) {
    next(e);
  }
}

export async function callRoster(callId) {
  const r = await query(
    `SELECT p.*, u.display_name, u.avatar_url FROM call_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.call_id = $1 AND p.left_at IS NULL ORDER BY p.joined_at`,
    [callId]
  );
  return r.rows.map((p) => ({
    userId: p.user_id, displayName: p.display_name, avatarUrl: p.avatar_url,
    muted: p.muted, cameraOff: p.camera_off, sharing: p.sharing, joinedAt: p.joined_at,
  }));
}
