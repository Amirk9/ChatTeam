import { pool } from './pg.js';
import { logger } from '../common/logger.js';

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getOne(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}
