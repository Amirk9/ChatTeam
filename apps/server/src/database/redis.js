import { createClient } from 'redis';
import { config } from '../config/index.js';

export const redis = createClient({
  url: config.redisUrl,
  socket: { connectTimeout: 3000, reconnectStrategy: false },
});
redis.on('error', () => {});

let connected = false;
export async function ensureRedis() {
  if (connected) return redis;
  try {
    await redis.connect();
    connected = true;
  } catch {}
  return redis;
}

export async function checkRedis() {
  try {
    await ensureRedis();
    const pong = await redis.ping();
    return { ok: pong === 'PONG' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
