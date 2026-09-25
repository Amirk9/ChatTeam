import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 3000,
});
// Prevent crash on background pool errors (e.g. PG down): /health must degrade, not die.
pool.on('error', () => {});

export async function checkPostgres() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try {
      client?.release();
    } catch {}
  }
}
