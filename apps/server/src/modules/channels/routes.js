import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { requireWorkspace, requirePermission, hasPermission } from '../workspaces/permissions.js';
import { createChannel, publicChannel, requireChannel } from './service.js';
import {
  channelCreateSchema,
  channelPatchSchema,
  channelMemberAddSchema,
  validate,
} from '@teamchat/validation';
import { publish } from '../../websocket/index.js';

export const channelsRouter = Router();

function withCounts(rows) {
  return rows.map((c) => publicChannel(c));
}

// POST /workspaces/:wid/channels — CREATE_CHANNEL (guests blocked by matrix).
workspacesChannelRoutes();
function workspacesChannelRoutes() {
  channelsRouter.post('/workspaces/:wid/channels', requireAuth, requireWorkspace, requirePermission('CREATE_CHANNEL'), async (req, res, next) => {
    try {
      // Slack parity: channel names are lowercase.
      const input = validate(channelCreateSchema, { ...req.body, name: String(req.body?.name || '').toLowerCase() });
      const exists = await getOne('SELECT id FROM channels WHERE workspace_id = $1 AND name = $2', [req.workspace.id, input.name]);
      if (exists) return res.status(409).json({ error: { code: 'NAME_TAKEN', message: 'Channel name already in use' } });
      const ch = await createChannel(req.workspace.id, req.user.id, input);
      await publish({ type: 'channel.created', payload: { channel: publicChannel(ch, { memberCount: 1 }) } }, [`workspace:${req.workspace.id}`]);
      res.status(201).json({ channel: publicChannel(ch, { memberCount: 1 }) });
    } catch (e) {
      next(e);
    }
  });

  // GET /workspaces/:wid/channels — public + private-where-member (Slack privacy).
  channelsRouter.get('/workspaces/:wid/channels', requireAuth, requireWorkspace, async (req, res, next) => {
    try {
      const r = await query(
        `SELECT c.*, (SELECT COUNT(*)::int FROM channel_members cm WHERE cm.channel_id = c.id) AS member_count,
          (SELECT COUNT(*)::int FROM messages m
            WHERE m.channel_id = c.id AND m.deleted_at IS NULL AND m.sender_id <> $2
              AND m.created_at > COALESCE((SELECT last_read_at FROM channel_members cm2 WHERE cm2.channel_id = c.id AND cm2.user_id = $2), '-infinity')) AS unread_count
         FROM channels c
         WHERE c.workspace_id = $1
           AND (c.is_private = false OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2))
         ORDER BY c.is_private, c.name`,
        [req.workspace.id, req.user.id]
      );
      res.json({ channels: withCounts(r.rows) });
    } catch (e) {
      next(e);
    }
  });
}

// GET /channels/:id
channelsRouter.get('/channels/:id', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const count = await getOne('SELECT COUNT(*)::int AS n FROM channel_members WHERE channel_id = $1', [req.channel.id]);
    res.json({ channel: publicChannel(req.channel, { memberCount: count.n, myRole: req.channelRole }) });
  } catch (e) {
    next(e);
  }
});

// PATCH /channels/:id — rename/description/topic. Members only, guests excluded.
channelsRouter.patch('/channels/:id', requireAuth, requireChannel, async (req, res, next) => {
  try {
    if (!req.channelRole) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Join the channel first' } });
    if (req.workspaceRole === 'guest') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Guests cannot edit channels' } });
    if (req.channel.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Archived channels are read-only' } });
    const patch = validate(channelPatchSchema, {
      ...req.body,
      ...(req.body?.name !== undefined ? { name: String(req.body.name).toLowerCase() } : {}),
    });
    const sets = [];
    const params = [];
    if (patch.name !== undefined) {
      const clash = await getOne('SELECT id FROM channels WHERE workspace_id = $1 AND name = $2 AND id <> $3', [req.channel.workspace_id, patch.name, req.channel.id]);
      if (clash) return res.status(409).json({ error: { code: 'NAME_TAKEN', message: 'Channel name already in use' } });
      params.push(patch.name, patch.name.toLowerCase());
      sets.push(`name = $${params.length - 1}`, `slug = $${params.length}`);
    }
    if (patch.description !== undefined) {
      params.push(patch.description);
      sets.push(`description = $${params.length}`);
    }
    if (patch.topic !== undefined) {
      params.push(patch.topic);
      sets.push(`topic = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Nothing to update' } });
    params.push(req.channel.id);
    const ch = await getOne(`UPDATE channels SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`, params);
    await publish({ type: 'channel.updated', payload: { channel: publicChannel(ch) } }, [`workspace:${ch.workspace_id}`]);
    res.json({ channel: publicChannel(ch) });
  } catch (e) {
    next(e);
  }
});

// POST /channels/:id/join — public: any non-guest workspace member. Private: members only (idempotent).
channelsRouter.post('/channels/:id/join', requireAuth, requireChannel, async (req, res, next) => {
  try {
    if (req.channel.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Channel is archived' } });
    if (req.channelRole) return res.json({ ok: true, already: true });
    if (req.channel.is_private) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Private channel — ask a member to add you' } });
    if (req.workspaceRole === 'guest') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Guests join by invitation only' } });
    await query('INSERT INTO channel_members(channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.channel.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /channels/:id/leave
channelsRouter.post('/channels/:id/leave', requireAuth, requireChannel, async (req, res, next) => {
  try {
    if (!req.channelRole) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not a member' } });
    if (req.channel.slug === 'general') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You cannot leave #general' } });
    await query('DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2', [req.channel.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /channels/:id/archive | /unarchive — workspace managers (Slack parity).
channelsRouter.post('/channels/:id/archive', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const ok = await hasPermission(req.channel.workspace_id, req.user.id, 'MANAGE_WORKSPACE');
    if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires MANAGE_WORKSPACE' } });
    if (req.channel.slug === 'general') return res.status(403).json({ error: { code: 'FORBIDDEN', message: '#general cannot be archived' } });
    await query('UPDATE channels SET is_archived = true WHERE id = $1', [req.channel.id]);
    await publish({ type: 'channel.archived', payload: { id: req.channel.id, workspaceId: req.channel.workspace_id } }, [`workspace:${req.channel.workspace_id}`]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

channelsRouter.post('/channels/:id/unarchive', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const ok = await hasPermission(req.channel.workspace_id, req.user.id, 'MANAGE_WORKSPACE');
    if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires MANAGE_WORKSPACE' } });
    await query('UPDATE channels SET is_archived = false WHERE id = $1', [req.channel.id]);
    await publish({ type: 'channel.updated', payload: { channel: publicChannel({ ...req.channel, is_archived: false }) } }, [`workspace:${req.channel.workspace_id}`]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// GET /channels/:id/members
channelsRouter.get('/channels/:id/members', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT u.id, u.display_name, u.email, u.avatar_url, u.status, cm.role, cm.joined_at
       FROM channel_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = $1 ORDER BY cm.joined_at`,
      [req.channel.id]
    );
    res.json({ members: r.rows });
  } catch (e) {
    next(e);
  }
});

// POST /channels/:id/members {userId} — INVITE_MEMBER; target must be in workspace.
channelsRouter.post('/channels/:id/members', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const ok = await hasPermission(req.channel.workspace_id, req.user.id, 'INVITE_MEMBER');
    if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires INVITE_MEMBER' } });
    if (req.channel.is_archived) return res.status(403).json({ error: { code: 'ARCHIVED', message: 'Channel is archived' } });
    const { userId } = validate(channelMemberAddSchema, req.body);
    const wsMember = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [req.channel.workspace_id, userId]);
    if (!wsMember) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'User is not in this workspace' } });
    await query('INSERT INTO channel_members(channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.channel.id, userId]);
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /channels/:id/members/:userId — REMOVE_MEMBER or self.
channelsRouter.delete('/channels/:id/members/:userId', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const self = req.params.userId === req.user.id;
    if (!self) {
      const ok = await hasPermission(req.channel.workspace_id, req.user.id, 'REMOVE_MEMBER');
      if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires REMOVE_MEMBER' } });
    }
    await query('DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2', [req.channel.id, req.params.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /channels/:id — DELETE_CHANNEL; #general protected (Slack parity).
channelsRouter.delete('/channels/:id', requireAuth, requireChannel, async (req, res, next) => {
  try {
    const ok = await hasPermission(req.channel.workspace_id, req.user.id, 'DELETE_CHANNEL');
    if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires DELETE_CHANNEL' } });
    if (req.channel.slug === 'general') return res.status(403).json({ error: { code: 'FORBIDDEN', message: '#general cannot be deleted' } });
    await query('DELETE FROM channels WHERE id = $1', [req.channel.id]);
    await publish({ type: 'channel.deleted', payload: { id: req.channel.id, workspaceId: req.channel.workspace_id } }, [`workspace:${req.channel.workspace_id}`]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
