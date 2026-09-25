import { Router } from 'express';
import { z } from 'zod';
import { getOne, query } from '../../database/db.js';
import { publicUser, requireAuth } from '../../common/auth.js';
import { validate } from '@teamchat/validation';
import { userDetailHandler } from '../workspaces/routes.js';

export const usersRouter = Router();

const patchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  timezone: z.string().max(80).nullable().optional(),
  status: z.enum(['ONLINE', 'AWAY', 'OFFLINE', 'DO_NOT_DISTURB']).optional(),
  customStatus: z.string().max(140).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

// GET /users/me
usersRouter.get('/users/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// GET /users/:id — only within a shared workspace (Slack-style).
usersRouter.get('/users/:id', requireAuth, userDetailHandler);

// PATCH /users/me
usersRouter.patch('/users/me', requireAuth, async (req, res, next) => {
  try {
    const patch = validate(patchSchema, req.body);
    const map = { displayName: 'display_name', timezone: 'timezone', status: 'status', customStatus: 'custom_status', avatarUrl: 'avatar_url' };
    const sets = [];
    const params = [];
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined) {
        params.push(patch[k]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Nothing to update' } });
    params.push(req.user.id);
    const user = await getOne(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`, params);
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});
