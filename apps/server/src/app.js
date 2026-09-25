import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config/index.js';
import { logger } from './common/logger.js';
import { requestId, notFound, errorHandler } from './common/errors.js';
import { healthRouter } from './modules/health/routes.js';

export function createApp() {
  const app = express();
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
