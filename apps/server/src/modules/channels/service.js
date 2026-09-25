import { getOne, query } from '../../database/db.js';

// Shared channel helpers (used by routes + workspace creation hook).
export async function createChannel(workspaceId, creatorId, { name, description = '', topic = '', isPrivate = false }) {
  const slug = name.toLowerCase();
  const ch = await getOne(
    `INSERT INTO channels(workspace_id, name, slug, description, topic, is_private, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [workspaceId, name, slug, description, topic, isPrivate, creatorId]
  );
  await query('INSERT INTO channel_members(channel_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ch.id, creatorId, 'owner']);
  return ch;
}

// Slack parity: every workspace has #general with all members in it.
export async function ensureGeneral(workspaceId, ownerId) {
  let general = await getOne("SELECT * FROM channels WHERE workspace_id = $1 AND slug = 'general'", [workspaceId]);
  if (!general) {
    general = await createChannel(workspaceId, ownerId, { name: 'general', description: 'Company-wide announcements and chat' });
  }
  await query(
    `INSERT INTO channel_members(channel_id, user_id, role)
     SELECT $1, wm.user_id, CASE WHEN wm.role = 'owner' THEN 'owner' ELSE 'member' END
     FROM workspace_members wm WHERE wm.workspace_id = $2
     ON CONFLICT DO NOTHING`,
    [general.id, workspaceId]
  );
  return general;
}

export function publicChannel(ch, extra = {}) {
  return {
    id: ch.id,
    workspaceId: ch.workspace_id,
    name: ch.name,
    slug: ch.slug,
    description: ch.description,
    topic: ch.topic,
    isPrivate: ch.is_private,
    isArchived: ch.is_archived,
    memberCount: ch.member_count !== undefined ? Number(ch.member_count) : undefined,
    unreadCount: ch.unread_count !== undefined ? Number(ch.unread_count) : undefined,
    ...extra,
  };
}

// Channel access: workspace membership required; private channels additionally
// require channel membership. Attaches req.channel (+ req.channelRole or null).
export async function requireChannel(req, res, next) {
  try {
    const ch = await getOne('SELECT * FROM channels WHERE id = $1', [req.params.id]);
    if (!ch) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    const wsMember = await getOne('SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [ch.workspace_id, req.user.id]);
    if (!wsMember) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    const chMember = await getOne('SELECT * FROM channel_members WHERE channel_id = $1 AND user_id = $2', [ch.id, req.user.id]);
    if (ch.is_private && !chMember) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Private channel' } });
    }
    req.channel = ch;
    req.workspaceRole = wsMember.role;
    req.channelRole = chMember ? chMember.role : null;
    next();
  } catch (e) {
    next(e);
  }
}
