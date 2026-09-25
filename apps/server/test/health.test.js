import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('GET /version returns server identity', async () => {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'teamchat-server');
  } finally {
    server.close();
  }
});

test('unknown route returns NOT_FOUND envelope', async () => {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/nope`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'NOT_FOUND');
  } finally {
    server.close();
  }
});
