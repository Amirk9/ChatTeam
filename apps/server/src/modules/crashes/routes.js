import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../database/db.js';
import { validate } from '@teamchat/validation';
import { logger } from '../../common/logger.js';

export const crashesRouter = Router();

const crashSchema = z.object({
  appVersion: z.string().max(32).optional().default(''),
  platform: z.string().max(32).optional().default(''),
  error: z.string().min(1).max(5000),
  stack: z.string().max(20000).optional(),
  context: z.record(z.unknown()).optional().default({}),
});

// POST /crashes — unauthenticated by design (the reporter may be unable to
// auth). Payload-capped, no PII beyond what the client sends.
crashesRouter.post('/crashes', async (req, res, next) => {
  try {
    const body = validate(crashSchema, req.body);
    const row = await query(
      `INSERT INTO crash_reports(app_version, platform, error, stack, context)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [body.appVersion, body.platform, body.error, body.stack || null, body.context]
    );
    logger.warn({ crashId: row.rows[0].id, appVersion: body.appVersion, platform: body.platform }, 'desktop crash report');
    res.status(201).json({ id: row.rows[0].id, receivedAt: row.rows[0].created_at });
  } catch (e) {
    next(e);
  }
});
