import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pg.js';
import { logger } from '../common/logger.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  // Serialize against parallel runners (node --test runs files concurrently).
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(42071)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      logger.info({ migration: f }, 'applying migration');
      const sql = readFileSync(join(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(42071)');
    } catch {}
    client.release();
  }
}
