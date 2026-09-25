import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { requireWorkspace, requirePermission } from '../workspaces/permissions.js';
import { botCreateSchema, botCommandSchema, botMessageSchema, botCallbackSchema, validate } from '@teamchat/validation';
import { executeSlash, postBotMessage } from './commands.js';

export const botsRouter = Router();

export function publicBot(b) {
  return { id: b.id, workspaceId: b.workspace_id, userId: b.user_id, name: b.name, createdAt: b.created_at };
}

// Bot identity: a real users row (threads/reactions/search just work) with a
// workspace 'bot' role, driven by an opaque token (sha256 stored).
async function createBotUser(workspaceId, name, creatorId) {
  const email = `bot-${randomBytes(6).toString('hex')}@bots.local`;
  const user = await getOne(
    `INSERT INTO users(email, password_hash, display_name, status) VALUES ($1,'!', $2, 'ONLINE') RETURNING *`,
    [email, name]
  );
  await query('INSERT INTO workspace_members(workspace_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4)', [workspaceId, user.id, 'bot', creatorId]);
  return user;
}

// POST /workspaces/:wid/bots {name} — MANAGE_INTEGRATIONS (Slack: apps need admin).
botsRouter.post('/workspaces/:wid/bots', requireAuth, requireWorkspace, requirePermission('MANAGE_INTEGRATIONS'), async (req, res, next) => {
  try {
    const { name } = validate(botCreateSchema, req.body);
    const user = await createBotUser(req.workspace.id, name, req.user.id);
    const token = randomBytes(32).toString('hex');
    const bot = await getOne(
      'INSERT INTO bots(workspace_id, user_id, name, token_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.workspace.id, user.id, name, createHash('sha256').update(token).digest('hex'), req.user.id]
    );
    res.status(201).json({ bot: publicBot(bot), token });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:wid/bots
botsRouter.get('/workspaces/:wid/bots', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM bots WHERE workspace_id = $1 ORDER BY created_at', [req.workspace.id]);
    res.json({ bots: r.rows.map(publicBot) });
  } catch (e) {
    next(e);
  }
});

// POST /bots/:id/commands — register /<command> (Slack slash registration).
botsRouter.post('/bots/:id/commands', requireAuth, async (req, res, next) => {
  try {
    const bot = await getOne('SELECT * FROM bots WHERE id = $1', [req.params.id]);
    if (!bot) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bot not found' } });
    const mem = await getOne('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [bot.workspace_id, req.user.id]);
    if (!mem) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    const can = await getOne(
      `SELECT 1 FROM role_permissions rp JOIN workspace_members wm ON wm.role = rp.role
       WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND rp.permission = 'MANAGE_INTEGRATIONS'`,
      [bot.workspace_id, req.user.id]
    );
    if (!can) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires MANAGE_INTEGRATIONS' } });
    const cmd = validate(botCommandSchema, req.body);
    const row = await getOne(
      `INSERT INTO bot_commands(bot_id, command, description, response_template, buttons)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (bot_id, command) DO UPDATE SET description = $3, response_template = $4, buttons = $5
       RETURNING *`,
      [bot.id, cmd.command, cmd.description, cmd.responseTemplate, JSON.stringify(cmd.buttons)]
    );
    res.status(201).json({ command: row });
  } catch (e) {
    next(e);
  }
});

function botAuth(req, res, next) {
  const token = req.headers['x-bot-token'];
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'x-bot-token required' } });
  getOne('SELECT * FROM bots WHERE token_hash = $1', [createHash('sha256').update(String(token)).digest('hex')])
    .then((bot) => {
      if (!bot) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bad bot token' } });
      req.bot = bot;
      next();
    })
    .catch(next);
}

// POST /bots/:id/messages — external services post as the bot (token auth).
botsRouter.post('/bots/:id/messages', botAuth, async (req, res, next) => {
  try {
    if (req.bot.id !== req.params.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Token mismatch' } });
    const { channelId, dmConversationId, content } = validate(botMessageSchema, req.body);
    if (!!channelId === !!dmConversationId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Exactly one target required' } });
    }
    const out = await postBotMessage(req.bot, { channelId, dmConversationId, content });
    res.status(201).json({ message: out });
  } catch (e) {
    next(e);
  }
});

// POST /bots/callbacks {messageId, action} — interactive button clicks.
botsRouter.post('/bots/callbacks', requireAuth, async (req, res, next) => {
  try {
    const { messageId, action } = validate(botCallbackSchema, req.body);
    const btn = await getOne('SELECT * FROM message_buttons WHERE message_id = $1 AND action_id = $2', [messageId, action]);
    if (!btn) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown button' } });
    const { getMessage } = await import('../messages/service.js');
    const msg = await getMessage(messageId);
    if (!msg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    const home = msg.dm_conversation_id
      ? { dmConversationId: msg.dm_conversation_id }
      : { channelId: msg.channel_id };
    // Attribute the click to whoever owns the button's bot.
    const bot = await getOne(
      `SELECT b.* FROM bots b JOIN users u ON u.id = b.user_id WHERE u.id = $1 LIMIT 1`,
      [msg.sender_id]
    );
    const who = req.user.display_name;
    const text = bot
      ? `👆 ${who} clicked *${btn.label}*`
      : `👆 ${who} clicked *${btn.label}*`;
    if (bot) {
      await postBotMessage(bot, { ...home, content: text });
    }
    res.json({ ok: true, label: btn.label });
  } catch (e) {
    next(e);
  }
});

// Slash entry shared by channel + DM send paths (see commands.js).
export { executeSlash };
