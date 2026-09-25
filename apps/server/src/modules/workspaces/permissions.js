import { getOne, query } from '../../database/db.js';

// Role hierarchy (higher = more power). Used to stop privilege escalation:
// you can never grant a role at/above your own, and only owners touch owners.
export const ROLE_RANK = Object.freeze({ guest: 0, bot: 0, member: 1, moderator: 2, admin: 3, owner: 4 });
export const ROLES = Object.freeze(Object.keys(ROLE_RANK));

export async function hasPermission(workspaceId, userId, permission) {
  const row = await getOne(
    `SELECT 1 FROM workspace_members wm
     JOIN role_permissions rp ON rp.role = wm.role
     WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND rp.permission = $3`,
    [workspaceId, userId, permission]
  );
  return Boolean(row);
}

// Loads workspace + caller's membership. 404 if workspace missing,
// 403 if caller is not a member. Attaches req.workspace / req.membership.
export async function requireWorkspace(req, res, next) {
  try {
    const wid = req.params.wid || req.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(wid || '')) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
    }
    const ws = await getOne('SELECT * FROM workspaces WHERE id = $1', [wid]);
    if (!ws) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
    const membership = await getOne(
      'SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [wid, req.user.id]
    );
    if (!membership) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    req.workspace = ws;
    req.membership = membership;
    next();
  } catch (e) {
    next(e);
  }
}

export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const ok = await hasPermission(req.workspace.id, req.user.id, permission);
      if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Requires ${permission}` } });
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function publicWorkspace(ws, role) {
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    iconUrl: ws.icon_url,
    settings: ws.settings,
    role: role || undefined,
    createdAt: ws.created_at,
  };
}
