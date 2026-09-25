import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { query, getOne } from '../database/db.js';
import { ensureRedis } from '../database/redis.js';
import { logger } from '../common/logger.js';

// Realtime gateway: Socket.IO + Redis pub/sub fan-out (plan 06, document §24).
// Rooms: user:{id}, workspace:{wid}, channel:{cid}, dm:{id} (Phase 09).
// Scale-out safe: every instance publishes to Redis; instances ignore own echoes.

const REDIS_CHANNEL = 'teamchat:events';
const PRESENCE_TTL = 60; // seconds; clients heartbeat every 25s
const TYPING_TTL = 4; // seconds

let io = null;
const instanceId = randomUUID();
let subscriber = null;

export function getIO() {
  return io;
}

export async function closeRealtime() {
  try {
    await subscriber?.unsubscribe(REDIS_CHANNEL);
  } catch {}
  try {
    await subscriber?.quit();
  } catch {}
  subscriber = null;
  if (io) {
    await new Promise((r) => io.close(r));
    io = null;
  }
}

function presenceKey(wid, uid) {
  return `presence:${wid}:${uid}`;
}

async function setPresence(wid, uid, state, displayName) {
  const redis = await ensureRedis();
  const key = presenceKey(wid, uid);
  if (state === 'OFFLINE') {
    await redis.del(key);
  } else {
    await redis.set(key, JSON.stringify({ state, displayName, at: new Date().toISOString() }), { EX: PRESENCE_TTL });
  }
  publish({ type: 'user.presence_changed', payload: { workspaceId: wid, userId: uid, state } }, [`workspace:${wid}`]);
}

export async function getPresence(wid) {
  try {
    const redis = await ensureRedis();
    const keys = await redis.keys(`presence:${wid}:*`);
    const out = {};
    for (const k of keys) {
      const uid = k.split(':').pop();
      try {
        out[uid] = JSON.parse(await redis.get(k));
      } catch {}
    }
    return out;
  } catch {
    return {};
  }
}

// Publish an event: local fan-out + Redis for other instances.
export async function publish(event, rooms) {
  if (io) {
    for (const room of rooms) io.to(room).emit('event', event);
  }
  try {
    const redis = await ensureRedis();
    await redis.publish(REDIS_CHANNEL, JSON.stringify({ from: instanceId, rooms, event }));
  } catch (e) {
    logger.warn({ err: e.message }, 'realtime redis publish failed (local emit only)');
  }
}

export function initRealtime(httpServer, corsOrigin) {
  io = new Server(httpServer, { cors: { origin: corsOrigin || true } });

  // Cross-instance subscriber.
  (async () => {
    try {
      const { createClient } = await import('redis');
      const { config } = await import('../config/index.js');
      subscriber = createClient({ url: config.redisUrl, socket: { reconnectStrategy: () => 2000 } });
      subscriber.on('error', () => {});
      await subscriber.connect();
      await subscriber.subscribe(REDIS_CHANNEL, (raw) => {
        try {
          const { from, rooms, event } = JSON.parse(raw);
          if (from === instanceId || !io) return;
          for (const room of rooms) io.to(room).emit('event', event);
        } catch {}
      });
    } catch (e) {
      logger.warn({ err: e.message }, 'realtime subscriber unavailable (single instance mode)');
    }
  })();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('missing token'));
      const claims = verifyAccessToken(token);
      const user = await getOne('SELECT * FROM users WHERE id = $1', [claims.sub]);
      if (!user) return next(new Error('unknown user'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('bad token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    try {
      const memberships = await query('SELECT workspace_id FROM workspace_members WHERE user_id = $1', [user.id]);
      for (const m of memberships.rows) {
        socket.join(`workspace:${m.workspace_id}`);
        const state = user.status === 'DO_NOT_DISTURB' ? 'DO_NOT_DISTURB' : 'ONLINE';
        await setPresence(m.workspace_id, user.id, state, user.display_name);
      }
      const chs = await query(
        `SELECT cm.channel_id FROM channel_members cm
         JOIN channels c ON c.id = cm.channel_id
         WHERE cm.user_id = $1 AND c.is_archived = false`,
        [user.id]
      );
      for (const c of chs.rows) socket.join(`channel:${c.channel_id}`);
      const dms = await query('SELECT conversation_id FROM direct_conversation_members WHERE user_id = $1', [user.id]);
      for (const d of dms.rows) socket.join(`dm:${d.conversation_id}`);
    } catch (e) {
      logger.warn({ err: e.message }, 'realtime join failed');
    }
    logger.info({ userId: user.id }, 'realtime connected');

    socket.on('presence.heartbeat', async ({ status } = {}) => {
      try {
        if (status) {
          await query('UPDATE users SET status = $1 WHERE id = $2', [status, user.id]);
          user.status = status;
        }
        const memberships = await query('SELECT workspace_id FROM workspace_members WHERE user_id = $1', [user.id]);
        const state = user.status === 'DO_NOT_DISTURB' ? 'DO_NOT_DISTURB' : 'ONLINE';
        for (const m of memberships.rows) await setPresence(m.workspace_id, user.id, state, user.display_name);
      } catch {}
    });

    socket.on('presence.list', async ({ workspaceId }, ack) => {
      if (typeof ack === 'function') ack(await getPresence(workspaceId));
    });

    socket.on('typing.start', async ({ channelId, dmId }) => {
      try {
        // DM typing (Phase 09): dmId or conversationId targets a DM room.
        const targetDm = dmId;
        if (targetDm) {
          const mem = await getOne(
            'SELECT 1 FROM direct_conversation_members WHERE conversation_id = $1 AND user_id = $2',
            [targetDm, user.id]
          );
          if (!mem) return;
          const redis = await ensureRedis();
          await redis.set(`dmtyping:${targetDm}:${user.id}`, user.display_name, { EX: TYPING_TTL });
          socket.to(`dm:${targetDm}`).emit('event', {
            type: 'dm.typing',
            payload: { dmId: targetDm, userId: user.id, displayName: user.display_name },
          });
          return;
        }
        if (!channelId) return;
        const ch = await getOne('SELECT id, workspace_id FROM channels WHERE id = $1', [channelId]);
        if (!ch) return;
        const member = await getOne(
          'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
          [ch.workspace_id, user.id]
        );
        if (!member) return;
        const redis = await ensureRedis();
        await redis.set(`typing:${channelId}:${user.id}`, user.display_name, { EX: TYPING_TTL });
        socket.to(`channel:${channelId}`).emit('event', {
          type: 'user.typing',
          payload: { channelId, userId: user.id, displayName: user.display_name },
        });
      } catch {}
    });

    socket.on('typing.stop', async ({ channelId, dmId } = {}) => {
      try {
        const redis = await ensureRedis();
        if (dmId) await redis.del(`dmtyping:${dmId}:${user.id}`);
        if (channelId) await redis.del(`typing:${channelId}:${user.id}`);
      } catch {}
    });

    // Phase 11A: WebRTC signaling relay (SDP offer/answer + ICE) + call rooms.
    // Server never sees media — it only introduces peers already on the call.
    socket.on('call.join', async ({ callId }, ack) => {
      try {
        const part = await getOne('SELECT 1 FROM call_participants WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL', [callId, user.id]);
        if (!part) return typeof ack === 'function' && ack({ ok: false });
        socket.join(`call:${callId}`);
        socket.to(`call:${callId}`).emit('event', { type: 'call.peer-joined', payload: { callId, userId: user.id } });
        if (typeof ack === 'function') ack({ ok: true });
      } catch {}
    });
    socket.on('call.leave', async ({ callId }) => {
      socket.leave(`call:${callId}`);
      socket.to(`call:${callId}`).emit('event', { type: 'call.peer-left', payload: { callId, userId: user.id } });
    });
    socket.on('call.signal', async ({ callId, to, signal }) => {
      try {
        if (!callId || !to || !signal) return;
        const [me, peer] = await Promise.all([
          getOne('SELECT 1 FROM call_participants WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL', [callId, user.id]),
          getOne('SELECT 1 FROM call_participants WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL', [callId, to]),
        ]);
        if (!me || !peer) return;
        io.to(`user:${to}`).emit('event', { type: 'call.signal', payload: { callId, from: user.id, signal } });
      } catch {}
    });

    // Phase 11B: canvas rooms (block edits also persist via REST + fan-out).
    socket.on('canvas.join', async ({ canvasId }, ack) => {
      try {
        const cv = await getOne('SELECT workspace_id FROM canvas WHERE id = $1', [canvasId]);
        if (!cv) return typeof ack === 'function' && ack({ ok: false });
        const mem = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [cv.workspace_id, user.id]);
        if (!mem) return typeof ack === 'function' && ack({ ok: false });
        socket.join(`canvas:${canvasId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch {}
    });
    socket.on('canvas.leave', async ({ canvasId }) => {
      socket.leave(`canvas:${canvasId}`);
    });

    socket.on('disconnect', async () => {
      try {
        const memberships = await query('SELECT workspace_id FROM workspace_members WHERE user_id = $1', [user.id]);
        for (const m of memberships.rows) await setPresence(m.workspace_id, user.id, 'OFFLINE', user.display_name);
        await query('UPDATE users SET last_seen_at = now() WHERE id = $1', [user.id]);
      } catch {}
      logger.info({ userId: user.id }, 'realtime disconnected');
    });
  });

  return io;
}
