import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { ensureRedis } from '../../database/redis.js';
import { logger } from '../../common/logger.js';
import { publicUser, requireAuth } from '../../common/auth.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { signAccessToken, newOpaqueToken, hashToken } from './tokens.js';
import { registerSchema, loginSchema, validate } from '@teamchat/validation';

export const authRouter = Router();

const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 30);

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

async function createSession(userId, req) {
  const expiresAt = daysFromNow(REFRESH_DAYS);
  const s = await getOne(
    'INSERT INTO sessions(user_id, device_info, ip, expires_at) VALUES ($1,$2,$3,$4) RETURNING *',
    [userId, req.headers['user-agent']?.slice(0, 255) || null, req.ip || null, expiresAt]
  );
  return s;
}

async function issueRefresh(userId, sessionId) {
  const raw = newOpaqueToken();
  const expiresAt = daysFromNow(REFRESH_DAYS);
  const row = await getOne(
    'INSERT INTO refresh_tokens(user_id, session_id, token_hash, expires_at) VALUES ($1,$2,$3,$4) RETURNING *',
    [userId, sessionId, hashToken(raw), expiresAt]
  );
  return { raw, row };
}

async function revokeSession(sessionId) {
  await query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL', [sessionId]);
}

// POST /auth/register
authRouter.post('/auth/register', async (req, res, next) => {
  try {
    const { email, password, displayName } = validate(registerSchema, req.body);
    const existing = await getOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
    const passwordHash = await hashPassword(password);
    const user = await getOne(
      'INSERT INTO users(email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING *',
      [email, passwordHash, displayName]
    );
    const raw = newOpaqueToken(32);
    await query('INSERT INTO email_verification_tokens(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval \'7 days\')', [user.id, hashToken(raw)]);
    logger.info({ email, userId: user.id }, 'registered (dev: verify token below)');
    logger.info({ verifyToken: raw }, 'DEV ONLY: email verification token');
    res.status(201).json({ user: publicUser(user), verificationRequired: true });
  } catch (e) {
    next(e);
  }
});

// POST /auth/login (Redis-throttled: 10 attempts/min per email)
authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = validate(loginSchema, req.body);
    const redis = await ensureRedis();
    const key = `login:${email.toLowerCase()}`;
    let attempts = 0;
    try {
      attempts = await redis.incr(key);
      if (attempts === 1) await redis.expire(key, 60);
    } catch {}
    if (attempts > 10) return res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many login attempts, try again in a minute' } });

    const user = await getOne('SELECT * FROM users WHERE email = $1', [email]);
    const ok = user ? await verifyPassword(user.password_hash, password) : false;
    if (!ok) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

    const session = await createSession(user.id, req);
    const { raw } = await issueRefresh(user.id, session.id);
    await query('UPDATE users SET status = $1 WHERE id = $2', ['ONLINE', user.id]);
    logger.info({ userId: user.id, sessionId: session.id }, 'login');
    res.json({ accessToken: signAccessToken(user.id, session.id), refreshToken: raw, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// POST /auth/refresh (rotation + reuse detection)
authRouter.post('/auth/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'refreshToken required' } });
    const stored = await getOne('SELECT * FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);
    if (!stored) return res.status(401).json({ error: { code: 'INVALID_REFRESH', message: 'Invalid refresh token' } });
    if (stored.revoked_at || stored.rotated_to || new Date(stored.expires_at) < new Date()) {
      // Possible reuse attack: kill the whole session chain.
      await revokeSession(stored.session_id);
      logger.warn({ sessionId: stored.session_id }, 'refresh reuse detected — session revoked');
      return res.status(401).json({ error: { code: 'REFRESH_REUSED', message: 'Session revoked, please login again' } });
    }
    const session = await getOne('SELECT * FROM sessions WHERE id = $1', [stored.session_id]);
    if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: { code: 'INVALID_REFRESH', message: 'Session expired' } });
    }
    const { raw, row } = await issueRefresh(stored.user_id, stored.session_id);
    await query('UPDATE refresh_tokens SET rotated_to = $1, revoked_at = now() WHERE id = $2', [row.id, stored.id]);
    res.json({ accessToken: signAccessToken(stored.user_id, stored.session_id), refreshToken: raw });
  } catch (e) {
    next(e);
  }
});

// POST /auth/logout
authRouter.post('/auth/logout', requireAuth, async (req, res, next) => {
  try {
    await revokeSession(req.session.id);
    await query('UPDATE users SET status = $1 WHERE id = $2', ['OFFLINE', req.user.id]);
    logger.info({ userId: req.user.id, sessionId: req.session.id }, 'logout');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// GET /auth/verify-email?token=
authRouter.get('/auth/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'token required' } });
    const stored = await getOne('SELECT * FROM email_verification_tokens WHERE token_hash = $1', [hashToken(String(token))]);
    if (!stored || stored.used_at || new Date(stored.expires_at) < new Date()) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired verification token' } });
    }
    await query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [stored.id]);
    await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [stored.user_id]);
    res.json({ verified: true });
  } catch (e) {
    next(e);
  }
});

// POST /auth/forgot-password (always 200 — no user enumeration)
authRouter.post('/auth/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const user = email ? await getOne('SELECT * FROM users WHERE email = $1', [email]) : null;
    if (user) {
      const raw = newOpaqueToken(32);
      await query("INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [user.id, hashToken(raw)]);
      logger.info({ userId: user.id, resetToken: raw }, 'DEV ONLY: password reset token');
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /auth/reset-password (resets + revokes all sessions)
authRouter.post('/auth/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 8 || String(password).length > 128) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'token and password (8-128 chars) required' } });
    }
    const stored = await getOne('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [hashToken(String(token))]);
    if (!stored || stored.used_at || new Date(stored.expires_at) < new Date()) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' } });
    }
    await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [stored.id]);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), stored.user_id]);
    await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [stored.user_id]);
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [stored.user_id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// GET /auth/me
authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
