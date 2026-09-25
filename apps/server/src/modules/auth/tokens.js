import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ACCESS_TTL = '15m';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw Object.assign(new Error('JWT_SECRET not configured'), { status: 500, code: 'CONFIG' });
  return s;
}

export function signAccessToken(userId, sessionId) {
  return jwt.sign({ sub: userId, sid: sessionId }, secret(), { expiresIn: ACCESS_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, secret());
}

export function newOpaqueToken(bytes = 48) {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
