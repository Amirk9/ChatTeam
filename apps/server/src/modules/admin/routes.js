import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { hasPermission } from '../workspaces/permissions.js';

// Compliance audit helper — call from every privileged action.
export async function auditLog(workspaceId, actorId, action, targetType = null, targetId = null, meta = {}) {
  try {
    await query(
      `INSERT INTO audit_logs(workspace_id, actor_id, action, target_type, target_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [workspaceId, actorId, action, targetType, targetId, JSON.stringify(meta)]
    );
  } catch {}
}

export const adminRouter = Router();

async function requireAuditViewer(req, res, next) {
  const { workspaceId } = req.query;
  if (!workspaceId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
  const mem = await getOne('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, req.user.id]);
  if (!mem) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
  if (!(await hasPermission(workspaceId, req.user.id, 'VIEW_AUDIT_LOG'))) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires VIEW_AUDIT_LOG' } });
  }
  req.auditWorkspace = workspaceId;
  next();
}

// GET /admin/users?workspaceId= — directory with roles + presence.
adminRouter.get('/admin/users', requireAuth, requireAuditViewer, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT u.id, u.email, u.display_name, u.status, u.created_at, wm.role, wm.joined_at
       FROM users u JOIN workspace_members wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1 ORDER BY wm.joined_at LIMIT 200`,
      [req.auditWorkspace]
    );
    res.json({ users: r.rows });
  } catch (e) {
    next(e);
  }
});

// GET /admin/sessions?workspaceId= — active sessions/devices.
adminRouter.get('/admin/sessions', requireAuth, requireAuditViewer, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT s.id, s.user_id, u.display_name, s.device_info, s.ip, s.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = $1
       WHERE s.revoked_at IS NULL AND s.expires_at > now()
       ORDER BY s.created_at DESC LIMIT 200`,
      [req.auditWorkspace]
    );
    res.json({ sessions: r.rows });
  } catch (e) {
    next(e);
  }
});

// GET /admin/audit?workspaceId=&limit= — compliance trail.
adminRouter.get('/admin/audit', requireAuth, requireAuditViewer, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const r = await query(
      `SELECT a.*, u.display_name AS actor FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.workspace_id = $1 ORDER BY a.created_at DESC LIMIT $2`,
      [req.auditWorkspace, limit]
    );
    res.json({ audit: r.rows });
  } catch (e) {
    next(e);
  }
});

// GET /admin/usage?workspaceId= — storage/messages/integrations overview.
adminRouter.get('/admin/usage', requireAuth, requireAuditViewer, async (req, res, next) => {
  try {
    const wid = req.auditWorkspace;
    const [msgs, files, channels, dms, bots, integs, calls, canvases] = await Promise.all([
      getOne('SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1', [wid]),
      getOne('SELECT COUNT(*)::int AS n, COALESCE(SUM(size),0)::bigint AS bytes FROM files WHERE workspace_id = $1', [wid]),
      getOne('SELECT COUNT(*)::int AS n FROM channels WHERE workspace_id = $1', [wid]),
      getOne('SELECT COUNT(*)::int AS n FROM direct_conversations WHERE workspace_id = $1', [wid]),
      getOne('SELECT COUNT(*)::int AS n FROM bots WHERE workspace_id = $1', [wid]),
      getOne('SELECT COUNT(*)::int AS n FROM integrations WHERE workspace_id = $1', [wid]),
      getOne(`SELECT COUNT(*)::int AS n FROM calls WHERE workspace_id = $1`, [wid]),
      getOne('SELECT COUNT(*)::int AS n FROM canvas WHERE workspace_id = $1', [wid]),
    ]);
    res.json({
      usage: {
        messages: msgs.n, files: files.n, fileBytes: Number(files.bytes),
        channels: channels.n, conversations: dms.n, bots: bots.n,
        integrations: integs.n, calls: calls.n, canvases: canvases.n,
      },
    });
  } catch (e) {
    next(e);
  }
});
