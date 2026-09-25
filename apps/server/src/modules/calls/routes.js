import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { requireWorkspace } from '../workspaces/permissions.js';
import { publicCall, getCall, requireCall, callRoster } from './service.js';
import { callCreateSchema, callMediaSchema, validate } from '@teamchat/validation';
import { publish, getIO } from '../../websocket/index.js';

export const callsRouter = Router();

function joinCallRoom(userIds, callId) {
  try {
    const io = getIO();
    if (!io) return;
    for (const id of userIds) io.in(`user:${id}`).socketsJoin(`call:${callId}`);
  } catch {}
}

// POST /workspaces/:wid/calls {channelId|dmConversationId} — start/join live huddle.
callsRouter.post('/workspaces/:wid/calls', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const { channelId, dmConversationId } = validate(callCreateSchema, req.body);
    if (!!channelId === !!dmConversationId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Exactly one of channelId/dmConversationId required' } });
    }
    let workspaceId = req.workspace.id;
    if (channelId) {
      const ch = await getOne('SELECT * FROM channels WHERE id = $1 AND workspace_id = $2', [channelId, workspaceId]);
      if (!ch) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } });
      if (ch.is_private) {
        const cm = await getOne('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [channelId, req.user.id]);
        if (!cm) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Private channel' } });
      }
    } else {
      const dm = await getOne('SELECT * FROM direct_conversations WHERE id = $1 AND workspace_id = $2', [dmConversationId, workspaceId]);
      if (!dm) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
      const mem = await getOne('SELECT 1 FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2', [dm.id, req.user.id]);
      if (!mem) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a conversation member' } });
    }
    // Reuse a live call on the same conversation (Slack: one huddle per channel).
    const existing = await getOne(
      `SELECT * FROM calls WHERE workspace_id = $1 AND status = 'live'
        AND ((channel_id IS NOT DISTINCT FROM $2) AND (dm_conversation_id IS NOT DISTINCT FROM $3))
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, channelId, dmConversationId]
    );
    const call = existing || await getOne(
      'INSERT INTO calls(workspace_id, channel_id, dm_conversation_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [workspaceId, channelId, dmConversationId, req.user.id]
    );
    await query(
      `INSERT INTO call_participants(call_id, user_id) VALUES ($1,$2)
       ON CONFLICT (call_id, user_id) DO UPDATE SET left_at = NULL`,
      [call.id, req.user.id]
    );
    const roster = await callRoster(call.id);
    joinCallRoom(roster.map((p) => p.userId), call.id);
    await publish({ type: 'call.started', payload: { call: publicCall(call), roster } }, [`workspace:${workspaceId}`]);
    await publish({ type: 'call.joined', payload: { callId: call.id, userId: req.user.id, roster } }, [`call:${call.id}`]);
    res.status(existing ? 200 : 201).json({ call: { ...publicCall(call), participants: roster }, reused: Boolean(existing) });
  } catch (e) {
    next(e);
  }
});

// GET /calls/active?workspaceId= — live huddles I can see.
callsRouter.get('/calls/active', requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
    const wsMember = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, req.user.id]);
    if (!wsMember) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    const r = await query(
      `SELECT c.* FROM calls c WHERE c.workspace_id = $1 AND c.status = 'live'
        AND ((c.channel_id IS NULL) OR (SELECT NOT is_private FROM channels WHERE id = c.channel_id)
             OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.channel_id AND cm.user_id = $2))
        AND ((c.dm_conversation_id IS NULL) OR EXISTS (SELECT 1 FROM direct_conversation_members dcm WHERE dcm.conversation_id = c.dm_conversation_id AND dcm.user_id = $2))
       ORDER BY c.created_at DESC`,
      [workspaceId, req.user.id]
    );
    const out = [];
    for (const row of r.rows) out.push({ ...publicCall(row), participants: await callRoster(row.id) });
    res.json({ calls: out });
  } catch (e) {
    next(e);
  }
});

// GET /calls/:id — roster included.
callsRouter.get('/calls/:id', requireAuth, requireCall, async (req, res, next) => {
  try {
    res.json({ call: { ...publicCall(req.call), participants: await callRoster(req.call.id) } });
  } catch (e) {
    next(e);
  }
});

// POST /calls/:id/media {muted,cameraOff,sharing} — roster state.
callsRouter.post('/calls/:id/media', requireAuth, requireCall, async (req, res, next) => {
  try {
    if (req.call.status !== 'live') return res.status(400).json({ error: { code: 'ENDED', message: 'Call has ended' } });
    const patch = validate(callMediaSchema, req.body);
    const sets = [];
    const params = [req.call.id, req.user.id];
    if (patch.muted !== undefined) { params.push(patch.muted); sets.push(`muted = $${params.length}`); }
    if (patch.cameraOff !== undefined) { params.push(patch.cameraOff); sets.push(`camera_off = $${params.length}`); }
    if (patch.sharing !== undefined) { params.push(patch.sharing); sets.push(`sharing = $${params.length}`); }
    if (sets.length) {
      await query(`UPDATE call_participants SET ${sets.join(', ')} WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL`, params);
    }
    const roster = await callRoster(req.call.id);
    await publish({ type: 'call.media', payload: { callId: req.call.id, userId: req.user.id, roster } }, [`call:${req.call.id}`]);
    res.json({ call: { ...publicCall(req.call), participants: roster } });
  } catch (e) {
    next(e);
  }
});

// POST /calls/:id/leave — leave; last one out ends the call (Slack huddle).
callsRouter.post('/calls/:id/leave', requireAuth, requireCall, async (req, res, next) => {
  try {
    await query('UPDATE call_participants SET left_at = now() WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL', [req.call.id, req.user.id]);
    const roster = await callRoster(req.call.id);
    await publish({ type: 'call.left', payload: { callId: req.call.id, userId: req.user.id, roster } }, [`call:${req.call.id}`]);
    if (!roster.length && req.call.status === 'live') {
      await query(`UPDATE calls SET status = 'ended', ended_at = now() WHERE id = $1`, [req.call.id]);
      await publish({ type: 'call.ended', payload: { callId: req.call.id } }, [`workspace:${req.call.workspace_id}`]);
    }
    res.json({ ok: true, participants: roster });
  } catch (e) {
    next(e);
  }
});

// POST /calls/:id/end — creator ends for everyone.
callsRouter.post('/calls/:id/end', requireAuth, requireCall, async (req, res, next) => {
  try {
    if (req.call.created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the starter can end the call' } });
    }
    await query(`UPDATE calls SET status = 'ended', ended_at = now() WHERE id = $1`, [req.call.id]);
    await publish({ type: 'call.ended', payload: { callId: req.call.id } }, [`call:${req.call.id}`, `workspace:${req.call.workspace_id}`]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
