import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('no-ts-guard passes (JS only)', () => {
  const out = execSync('node ./scripts/no-ts-guard.js', { encoding: 'utf8' });
  assert.match(out, /clean/);
});
