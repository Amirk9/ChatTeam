import { Router } from 'express';
import { getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { getPresence } from '../../websocket/index.js';

export const presenceRouter = Router();

// GET /presence?workspaceId= — initial snapshot (live deltas arrive over WS).
presenceRouter.get('/presence', requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
    const member = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, req.user.id]);
    if (!member) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    res.json({ presence: await getPresence(workspaceId) });
  } catch (e) {
    next(e);
  }
});
