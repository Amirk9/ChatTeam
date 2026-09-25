import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { query, getOne } from '../../database/db.js';
import { publicUser, requireAuth } from '../../common/auth.js';
import { hashToken, newOpaqueToken } from '../auth/tokens.js';
import {
  requireWorkspace,
  requirePermission,
  publicWorkspace,
  hasPermission,
  ROLE_RANK,
  ROLES,
} from './permissions.js';
import {
  workspaceCreateSchema,
  workspacePatchSchema,
  inviteCreateSchema,
  joinSchema,
  memberRoleSchema,
  validate,
} from '@teamchat/validation';
import { ensureGeneral } from '../channels/service.js';

export const workspacesRouter = Router();

function slugify(name) {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'workspace'
  );
}

async function uniqueSlug(base) {
  let slug = base;
  for (let i = 0; i < 10; i++) {
    const exists = await getOne('SELECT id FROM workspaces WHERE slug = $1', [slug]);
    if (!exists) return slug;
    slug = `${base}-${randomBytes(3).toString('hex')}`;
  }
  return `${base}-${Date.now()}`;
}

// POST /workspaces — creator becomes owner (like Slack).
workspacesRouter.post('/workspaces', requireAuth, async (req, res, next) => {
  try {
    const { name, slug } = validate(workspaceCreateSchema, req.body);
    const finalSlug = await uniqueSlug(slug || slugify(name));
    const ws = await getOne(
      'INSERT INTO workspaces(name, slug, created_by) VALUES ($1,$2,$3) RETURNING *',
      [name, finalSlug, req.user.id]
    );
    await query(
      'INSERT INTO workspace_members(workspace_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4)',
      [ws.id, req.user.id, 'owner', req.user.id]
    );
    await ensureGeneral(ws.id, req.user.id);
    res.status(201).json({ workspace: publicWorkspace(ws, 'owner') });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces — mine with my role.
workspacesRouter.get('/workspaces', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT w.*, wm.role FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1 ORDER BY w.created_at`,
      [req.user.id]
    );
    res.json({ workspaces: r.rows.map((w) => publicWorkspace(w, w.role)) });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:id
workspacesRouter.get('/workspaces/:id', requireAuth, requireWorkspace, async (req, res) => {
  const count = await getOne('SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1', [req.workspace.id]);
  res.json({ workspace: { ...publicWorkspace(req.workspace, req.membership.role), memberCount: count.n } });
});

// PATCH /workspaces/:id
workspacesRouter.patch('/workspaces/:id', requireAuth, requireWorkspace, requirePermission('MANAGE_WORKSPACE'), async (req, res, next) => {
  try {
    const patch = validate(workspacePatchSchema, req.body);
    const sets = [];
    const params = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.iconUrl !== undefined) {
      params.push(patch.iconUrl);
      sets.push(`icon_url = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Nothing to update' } });
    params.push(req.workspace.id);
    const ws = await getOne(`UPDATE workspaces SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`, params);
    res.json({ workspace: publicWorkspace(ws, req.membership.role) });
  } catch (e) {
    next(e);
  }
});

// DELETE /workspaces/:id — owner only.
workspacesRouter.delete('/workspaces/:id', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    if (req.membership.role !== 'owner') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the owner can delete a workspace' } });
    }
    await query('DELETE FROM workspaces WHERE id = $1', [req.workspace.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /workspaces/:id/invites — shareable code, optional email lock.
workspacesRouter.post('/workspaces/:id/invites', requireAuth, requireWorkspace, requirePermission('INVITE_MEMBER'), async (req, res, next) => {
  try {
    const { email, role } = validate(inviteCreateSchema, req.body);
    if (ROLE_RANK[role] >= ROLE_RANK[req.membership.role]) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot invite at or above your own role' } });
    }
    const raw = newOpaqueToken(24);
    const inv = await getOne(
      'INSERT INTO invites(workspace_id, email, role, token_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, workspace_id, email, role, expires_at, created_at',
      [req.workspace.id, email || null, role, hashToken(raw), req.user.id]
    );
    res.status(201).json({ invite: { ...inv, token: raw } });
  } catch (e) {
    next(e);
  }
});

// POST /workspaces/join { token }
workspacesRouter.post('/workspaces/join', requireAuth, async (req, res, next) => {
  try {
    const { token } = validate(joinSchema, req.body);
    const inv = await getOne('SELECT * FROM invites WHERE token_hash = $1', [hashToken(token)]);
    if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired invite' } });
    }
    if (inv.email && inv.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This invite is for a different email' } });
    }
    await query(
      `INSERT INTO workspace_members(workspace_id, user_id, role, invited_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [inv.workspace_id, req.user.id, inv.role, inv.created_by]
    );
    // Slack parity: every workspace member is in #general.
    await query(
      `INSERT INTO channel_members(channel_id, user_id, role)
       SELECT c.id, $1, 'member' FROM channels c
       WHERE c.workspace_id = $2 AND c.slug = 'general'
       ON CONFLICT DO NOTHING`,
      [req.user.id, inv.workspace_id]
    );
    await query('UPDATE invites SET accepted_at = now() WHERE id = $1', [inv.id]);
    const ws = await getOne('SELECT * FROM workspaces WHERE id = $1', [inv.workspace_id]);
    res.json({ workspace: publicWorkspace(ws, inv.role) });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:id/members
workspacesRouter.get('/workspaces/:id/members', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT u.id, u.email, u.display_name, u.avatar_url, u.status, u.custom_status, u.timezone,
              u.email_verified_at, wm.role, wm.joined_at
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 ORDER BY wm.joined_at`,
      [req.workspace.id]
    );
    res.json({
      members: r.rows.map((m) => ({ user: publicUser({ ...m, display_name: m.display_name }), role: m.role, joinedAt: m.joined_at })),
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /workspaces/:id/members/:userId — owners manage roles, never escalate past self.
workspacesRouter.patch('/workspaces/:id/members/:userId', requireAuth, requireWorkspace, requirePermission('MANAGE_ROLES'), async (req, res, next) => {
  try {
    const { role } = validate(memberRoleSchema, req.body);
    if (!ROLES.includes(role)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Unknown role' } });
    const target = await getOne('SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [req.workspace.id, req.params.userId]);
    if (!target) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Member not found' } });
    if (target.role === 'owner') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Ownership cannot be changed here' } });
    }
    if (ROLE_RANK[role] >= ROLE_RANK[req.membership.role] || ROLE_RANK[target.role] >= ROLE_RANK[req.membership.role]) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot grant or change a role at/above your own' } });
    }
    await query('UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3', [role, req.workspace.id, req.params.userId]);
    res.json({ ok: true, role });
  } catch (e) {
    next(e);
  }
});

// DELETE /workspaces/:id/members/:userId — remove (or leave yourself).
workspacesRouter.delete('/workspaces/:id/members/:userId', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const leaving = req.params.userId === req.user.id;
    if (!leaving) {
      const ok = await hasPermission(req.workspace.id, req.user.id, 'REMOVE_MEMBER');
      if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires REMOVE_MEMBER' } });
    }
    const target = await getOne('SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [req.workspace.id, req.params.userId]);
    if (!target) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Member not found' } });
    if (target.role === 'owner') {
      const owners = await getOne("SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'", [req.workspace.id]);
      if (owners.n <= 1) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'A workspace needs at least one owner' } });
    }
    await query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [req.workspace.id, req.params.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /workspaces/:id/switch — current workspace context (token scoping lands with channels).
workspacesRouter.post('/workspaces/:id/switch', requireAuth, requireWorkspace, async (req, res) => {
  const count = await getOne('SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1', [req.workspace.id]);
  res.json({ workspace: { ...publicWorkspace(req.workspace, req.membership.role), memberCount: count.n } });
});

// GET /users/:id — visible only within a shared workspace (like Slack).
export async function userDetailHandler(req, res, next) {
  try {
    const shared = await getOne(
      `SELECT 1 FROM workspace_members a JOIN workspace_members b ON b.workspace_id = a.workspace_id
       WHERE a.user_id = $1 AND b.user_id = $2 LIMIT 1`,
      [req.user.id, req.params.id]
    );
    if (!shared && req.params.id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No shared workspace' } });
    }
    const u = await getOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    res.json({ user: publicUser(u) });
  } catch (e) {
    next(e);
  }
}
