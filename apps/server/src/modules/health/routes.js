import { Router } from 'express';
import { config } from '../../config/index.js';
import { checkPostgres } from '../../database/pg.js';
import { checkRedis } from '../../database/redis.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);
  const ok = postgres.ok && redis.ok;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    version: config.version,
    deps: { postgres, redis },
  });
});

healthRouter.get('/version', (_req, res) => {
  res.json({ version: config.version, name: 'teamchat-server' });
});
