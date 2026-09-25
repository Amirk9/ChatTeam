import dotenv from 'dotenv';
dotenv.config();

function required(name, fallback = undefined) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://teamchat:teamchat@localhost:5432/teamchat',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  logLevel: process.env.LOG_LEVEL || 'info',
  version: '0.1.0',
  // Phase 10: desktop compatibility + update feed (env-driven release channel).
  minAppVersion: process.env.MIN_APP_VERSION || '0.1.0',
  updateVersion: process.env.APP_LATEST_VERSION || null,
  updateUrl: process.env.APP_UPDATE_URL || null,
  updateNotes: process.env.APP_UPDATE_NOTES || '',
};
