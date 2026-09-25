import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config/index.js';
import { logger } from './common/logger.js';
import { requestId, notFound, errorHandler } from './common/errors.js';
import { healthRouter } from './modules/health/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { workspacesRouter } from './modules/workspaces/routes.js';
import { channelsRouter } from './modules/channels/routes.js';
import { messagesRouter } from './modules/messages/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { presenceRouter } from './modules/presence/routes.js';
import { filesRouter } from './modules/files/routes.js';

export function createApp() {
  const app = express();
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter);
  app.use(authRouter);
  app.use(usersRouter);
  app.use(workspacesRouter);
  app.use(channelsRouter);
  app.use(messagesRouter);
  app.use(notificationsRouter);
  app.use(presenceRouter);
  app.use(filesRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
