import { Router } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { requireWorkspace, requirePermission } from '../workspaces/permissions.js';
import { integrationCreateSchema, subscriptionSchema, validate } from '@teamchat/validation';

export const integrationsRouter = Router();

function publicIntegration(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, name: row.name,
    provider: row.provider, channelId: row.channel_id,
    hasWebhook: Boolean(row.webhook_token_hash),
    createdAt: row.created_at,
  };
}

// Outgoing fan-out: POST signed JSON to every subscription of an event.
// Fire-and-forget from request paths; deliveries are logged best-effort.
export async function dispatchIntegrationEvent(workspaceId, event, payload) {
  try {
    const subs = await query(
      `SELECT s.*, i.signing_secret FROM webhook_subscriptions s
       JOIN integrations i ON i.id = s.integration_id
       WHERE i.workspace_id = $1 AND $2 = ANY(s.events)`,
      [workspaceId, event]
    );
    for (const sub of subs.rows) {
      const body = JSON.stringify({ event, ...payload });
      const headers = { 'Content-Type': 'application/json', 'x-teamchat-event': event };
      if (sub.secret) {
        headers['x-teamchat-signature'] = `sha256=${createHmac('sha256', sub.secret).update(body).digest('hex')}`;
      }
      const started = Date.now();
      try {
        const res = await fetch(sub.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
        await query('INSERT INTO webhook_deliveries(subscription_id, event, status) VALUES ($1,$2,$3)', [sub.id, event, res.status]);
      } catch (err) {
        await query('INSERT INTO webhook_deliveries(subscription_id, event, status) VALUES ($1,$2,$3)', [sub.id, event, -1]);
        void started;
        void err;
      }
    }
  } catch {}
}

// POST /workspaces/:wid/integrations {name, provider?, channelId?} — admin only.
integrationsRouter.post('/workspaces/:wid/integrations', requireAuth, requireWorkspace, requirePermission('MANAGE_INTEGRATIONS'), async (req, res, next) => {
  try {
    const input = validate(integrationCreateSchema, req.body);
    if (input.channelId) {
      const ch = await getOne('SELECT id FROM channels WHERE id = $1 AND workspace_id = $2', [input.channelId, req.workspace.id]);
      if (!ch) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    }
    const webhookToken = randomBytes(24).toString('hex');
    const row = await getOne(
      `INSERT INTO integrations(workspace_id, name, provider, channel_id, webhook_token_hash, signing_secret, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.workspace.id, input.name, input.provider || 'custom', input.channelId || null,
        createHash('sha256').update(webhookToken).digest('hex'), randomBytes(24).toString('hex'), req.user.id]
    );
    res.status(201).json({ integration: publicIntegration(row), webhookToken, incomingUrl: `/hooks/${webhookToken}` });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:wid/integrations
integrationsRouter.get('/workspaces/:wid/integrations', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM integrations WHERE workspace_id = $1 ORDER BY created_at', [req.workspace.id]);
    res.json({ integrations: r.rows.map(publicIntegration) });
  } catch (e) {
    next(e);
  }
});

// DELETE /integrations/:id — admin only.
integrationsRouter.delete('/integrations/:id', requireAuth, async (req, res, next) => {
  try {
    const integ = await getOne('SELECT * FROM integrations WHERE id = $1', [req.params.id]);
    if (!integ) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Integration not found' } });
    const mem = await getOne('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [integ.workspace_id, req.user.id]);
    if (!mem) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    const { hasPermission } = await import('../workspaces/permissions.js');
    if (!(await hasPermission(integ.workspace_id, req.user.id, 'MANAGE_INTEGRATIONS'))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires MANAGE_INTEGRATIONS' } });
    }
    await query('DELETE FROM integrations WHERE id = $1', [integ.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /integrations/:id/subscriptions {url, events[]} — outgoing hooks.
integrationsRouter.post('/integrations/:id/subscriptions', requireAuth, async (req, res, next) => {
  try {
    const integ = await getOne('SELECT * FROM integrations WHERE id = $1', [req.params.id]);
    if (!integ) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Integration not found' } });
    const { hasPermission } = await import('../workspaces/permissions.js');
    if (!(await hasPermission(integ.workspace_id, req.user.id, 'MANAGE_INTEGRATIONS'))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires MANAGE_INTEGRATIONS' } });
    }
    const sub = validate(subscriptionSchema, req.body);
    const row = await getOne(
      'INSERT INTO webhook_subscriptions(integration_id, url, events, secret) VALUES ($1,$2,$3,$4) RETURNING id, url, events, created_at',
      [integ.id, sub.url, sub.events, randomBytes(24).toString('hex')]
    );
    res.status(201).json({ subscription: row });
  } catch (e) {
    next(e);
  }
});

// POST /hooks/:token — incoming webhook → channel post (Slack incoming-webhook
// parity). Generic JSON {text} or GitHub push/PR payloads (formatted).
// GitHub signature (x-hub-signature-256) verified when checkable; generic
// callers use the unguessable token URL itself as the secret.
integrationsRouter.post('/hooks/:token', async (req, res, next) => {
  try {
    const integ = await getOne('SELECT * FROM integrations WHERE webhook_token_hash = $1', [createHash('sha256').update(String(req.params.token)).digest('hex')]);
    if (!integ) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown webhook' } });
    if (!integ.channel_id) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Integration has no target channel' } });
    const githubSig = req.headers['x-hub-signature-256'];
    if (githubSig && integ.signing_secret) {
      const raw = JSON.stringify(req.body || {});
      const expect = `sha256=${createHmac('sha256', integ.signing_secret).update(raw).digest('hex')}`;
      const ok = githubSig.length === expect.length && timingSafeEqual(Buffer.from(githubSig), Buffer.from(expect));
      if (!ok) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bad signature' } });
    }
    const text = formatIncoming(req.body, req.headers);
    if (!text) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Nothing to post (need text or a GitHub event)' } });
    const ch = await getOne('SELECT * FROM channels WHERE id = $1', [integ.channel_id]);
    if (!ch || ch.is_archived) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Target channel unavailable' } });
    const sender = integ.created_by || ch.created_by;
    const msg = await getOne(
      `INSERT INTO messages(workspace_id, channel_id, sender_id, content, message_type) VALUES ($1,$2,$3,$4,'bot') RETURNING *`,
      [integ.workspace_id, ch.id, sender, text]
    );
    const { serializeMessage, getMessage } = await import('../messages/service.js');
    const { publish } = await import('../../websocket/index.js');
    const full = await getMessage(msg.id);
    const out = serializeMessage(full);
    await publish({ type: 'message.created', payload: { message: out } }, [`channel:${ch.id}`]);
    res.status(201).json({ message: out });
  } catch (e) {
    next(e);
  }
});

function formatIncoming(body = {}, headers = {}) {
  if (body && typeof body.text === 'string' && body.text.trim()) {
    return body.text.slice(0, 8000);
  }
  const ghEvent = headers['x-github-event'];
  // GitHub PR merged → "#development: PR #125 was merged" (vision doc example).
  if (ghEvent === 'pull_request' && body.pull_request) {
    const pr = body.pull_request;
    const action = pr.merged ? 'was merged 🎉' : `${body.action || 'updated'}`;
    return `🔀 PR #${pr.number || '?'} ${action} — *${pr.title || ''}* (${pr.user?.login || 'someone'})`;
  }
  if ((ghEvent === 'push' || body.commits) && Array.isArray(body.commits)) {
    const n = body.commits.length;
    const repo = body.repository?.full_name || 'repo';
    return `📦 ${n} commit${n === 1 ? '' : 's'} pushed to *${repo}* (${(body.commits[0]?.message || '').slice(0, 120)})`;
  }
  return null;
}
