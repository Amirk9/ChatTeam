import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { requireWorkspace, requirePermission } from '../workspaces/permissions.js';
import { workflowCreateSchema, workflowRunSchema, onboardingSchema, validate } from '@teamchat/validation';
import { notifyUser } from '../notifications/routes.js';
import { publish } from '../../websocket/index.js';
import { serializeMessage, getMessage } from '../messages/service.js';
import { createChannel } from '../channels/service.js';

export const workflowsRouter = Router();

function publicWorkflow(row, steps = []) {
  return {
    id: row.id, workspaceId: row.workspace_id, name: row.name,
    description: row.description, trigger: row.trigger, steps,
    createdAt: row.created_at,
  };
}

async function loadSteps(workflowId) {
  const r = await query('SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY position', [workflowId]);
  return r.rows.map((s) => ({ id: s.id, kind: s.kind, config: s.config, position: s.position }));
}

// Action executors (Trigger→Condition→Action→Result). Each returns a result entry.
// `prior` is the flat merge of all previous step results ({{placeholders}}).
async function runStep(workspaceId, actorId, step, inputs, prior) {
  const cfg = { ...(step.config || {}), ...inputs };
  const sub = (v) => typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_m, k) => inputs[k] ?? prior[k] ?? '') : v;
  switch (step.kind) {
    case 'create_channel': {
      const name = String(sub(cfg.name || 'workflow-channel')).toLowerCase();
      const exists = await getOne('SELECT id FROM channels WHERE workspace_id = $1 AND name = $2', [workspaceId, name]);
      const ch = exists || await createChannel(workspaceId, actorId, { name, description: String(sub(cfg.description || 'Created by workflow')) });
      await publish({ type: 'channel.created', payload: { channel: ch } }, [`workspace:${workspaceId}`]);
      return { channelId: ch.id || ch };
    }
    case 'post_message': {
      const channelId = sub(cfg.channelId || prior.channelId);
      if (!channelId) throw Object.assign(new Error('post_message needs channelId'), { status: 400 });
      const msg = await getOne(
        `INSERT INTO messages(workspace_id, channel_id, sender_id, content, message_type) VALUES ($1,$2,$3,$4,'bot') RETURNING *`,
        [workspaceId, channelId, actorId, String(sub(cfg.content || '(workflow message)')).slice(0, 8000)]
      );
      const full = await getMessage(msg.id);
      const out = serializeMessage(full);
      await publish({ type: 'message.created', payload: { message: out } }, [`channel:${channelId}`]);
      return { messageId: msg.id };
    }
    case 'invite_user': {
      const email = String(sub(cfg.email || inputs.newUserEmail || '')).toLowerCase();
      if (!email) throw Object.assign(new Error('invite_user needs email'), { status: 400 });
      const target = await getOne('SELECT id FROM users WHERE lower(email) = $1', [email]);
      if (!target) return { invited: false, reason: 'no such user yet' };
      await query('INSERT INTO workspace_members(workspace_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [workspaceId, target.id, 'member', actorId]);
      return { invited: true, userId: target.id };
    }
    case 'notify_user': {
      const userId = sub(cfg.userId || inputs.hrUserId);
      if (!userId) throw Object.assign(new Error('notify_user needs userId'), { status: 400 });
      await notifyUser(userId, workspaceId, 'workflow', null);
      return { notified: userId };
    }
    default:
      throw Object.assign(new Error(`Unknown step kind: ${step.kind}`), { status: 400 });
  }
}

export async function runWorkflow(workflowId, actorId, inputs = {}) {
  const wf = await getOne('SELECT * FROM workflows WHERE id = $1', [workflowId]);
  if (!wf) throw Object.assign(new Error('Workflow not found'), { status: 404 });
  const steps = await loadSteps(workflowId);
  const results = {};
  const prior = {};
  try {
    for (const step of steps) {
      const r = await runStep(wf.workspace_id, actorId, step, inputs, prior);
      results[step.kind] = r;
      Object.assign(prior, r);
    }
    const run = await getOne('INSERT INTO workflow_runs(workflow_id, status, result, run_by) VALUES ($1,$2,$3,$4) RETURNING *', [workflowId, 'ok', JSON.stringify(results), actorId]);
    return { run, results };
  } catch (err) {
    await getOne('INSERT INTO workflow_runs(workflow_id, status, result, run_by) VALUES ($1,$2,$3,$4) RETURNING *', [workflowId, 'error', JSON.stringify({ error: err.message, partial: results }), actorId]);
    throw err;
  }
}

// POST /workspaces/:wid/workflows — builder (Slack Workflow Builder parity).
workflowsRouter.post('/workspaces/:wid/workflows', requireAuth, requireWorkspace, requirePermission('MANAGE_WORKSPACE'), async (req, res, next) => {
  try {
    const input = validate(workflowCreateSchema, req.body);
    const wf = await getOne(
      'INSERT INTO workflows(workspace_id, name, description, trigger, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.workspace.id, input.name, input.description, JSON.stringify(input.trigger), req.user.id]
    );
    for (let i = 0; i < input.steps.length; i++) {
      await query('INSERT INTO workflow_steps(workflow_id, kind, config, position) VALUES ($1,$2,$3,$4)', [wf.id, input.steps[i].kind, JSON.stringify(input.steps[i].config || {}), i]);
    }
    res.status(201).json({ workflow: publicWorkflow(wf, input.steps) });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:wid/workflows
workflowsRouter.get('/workspaces/:wid/workflows', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM workflows WHERE workspace_id = $1 ORDER BY created_at', [req.workspace.id]);
    const out = [];
    for (const row of r.rows) out.push(publicWorkflow(row, await loadSteps(row.id)));
    res.json({ workflows: out });
  } catch (e) {
    next(e);
  }
});

// POST /workflows/:id/run {inputs}
workflowsRouter.post('/workflows/:id/run', requireAuth, async (req, res, next) => {
  try {
    const wf = await getOne('SELECT * FROM workflows WHERE id = $1', [req.params.id]);
    if (!wf) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    const mem = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [wf.workspace_id, req.user.id]);
    if (!mem) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    const { inputs } = validate(workflowRunSchema, req.body);
    const { run, results } = await runWorkflow(wf.id, req.user.id, inputs);
    res.status(201).json({ run, results });
  } catch (e) {
    next(e);
  }
});

// POST /workflows/templates/onboarding — vision-doc example: new hire joins →
// onboarding channel → welcome message → checklist → notify HR.
workflowsRouter.post('/workflows/templates/onboarding', requireAuth, async (req, res, next) => {
  try {
    const { newUserEmail, channelName, hrUserId } = validate(onboardingSchema, req.body);
    // Template runs in the caller's first workspace (Slack runs it where installed).
    const mem = await getOne('SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1', [req.user.id]);
    if (!mem) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Join a workspace first' } });
    const wf = await getOne(
      `INSERT INTO workflows(workspace_id, name, description, trigger, created_by)
       VALUES ($1,'Employee onboarding','New hire checklist flow', $2, $3) RETURNING *`,
      [mem.workspace_id, JSON.stringify({ type: 'manual', template: 'onboarding' }), req.user.id]
    );
    const steps = [
      { kind: 'create_channel', config: { name: channelName, description: `Onboarding for ${newUserEmail}` } },
      { kind: 'post_message', config: { content: `👋 Welcome <${newUserEmail}>! Checklist: 1) say hi 2) read #general 3) set up your profile` } },
      { kind: 'invite_user', config: { email: newUserEmail } },
      ...(hrUserId ? [{ kind: 'notify_user', config: { userId: hrUserId } }] : []),
    ];
    for (let i = 0; i < steps.length; i++) {
      await query('INSERT INTO workflow_steps(workflow_id, kind, config, position) VALUES ($1,$2,$3,$4)', [wf.id, steps[i].kind, JSON.stringify(steps[i].config), i]);
    }
    const { run, results } = await runWorkflow(wf.id, req.user.id, { newUserEmail, hrUserId });
    res.status(201).json({ workflow: publicWorkflow(wf, steps), run, results });
  } catch (e) {
    next(e);
  }
});
