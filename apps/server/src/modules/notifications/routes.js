import { Router } from 'express';
import { query } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { publish } from '../../websocket/index.js';

export const notificationsRouter = Router();

export async function notifyUser(userId, workspaceId, type, refId) {
  const n = await query(
    'INSERT INTO notifications(user_id, workspace_id, type, ref_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [userId, workspaceId, type, refId || null]
  ).then((r) => r.rows[0]);
  await publish(
    {
      type: 'notification.created',
      payload: {
        id: n.id,
        userId,
        workspaceId,
        type,
        refId: n.ref_id,
        createdAt: n.created_at,
      },
    },
    [`user:${userId}`]
  );
  return n;
}

// GET /notifications?limit= — mine, newest first.
notificationsRouter.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const r = await query(
      `SELECT n.*, w.name AS workspace_name FROM notifications n
       JOIN workspaces w ON w.id = n.workspace_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2`,
      [req.user.id, limit]
    );
    const unread = await query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = false', [req.user.id]);
    res.json({ notifications: r.rows, unreadCount: unread.rows[0].n });
  } catch (e) {
    next(e);
  }
});

// POST /notifications/read {ids?} — empty = mark all read.
notificationsRouter.post('/notifications/read', requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    if (ids && ids.length) {
      await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND id = ANY($2)', [req.user.id, ids]);
    } else {
      await query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
