import { query, getOne } from '../../database/db.js';
import { serializeMessage, getMessage, loadReactions, loadMentions, loadAttachments } from '../messages/service.js';
import { publish } from '../../websocket/index.js';

// Slash + bot posting engine. Channel/DM send paths call executeSlash()
// when content starts with '/'; unknown commands fall through as plain text.

// Post a message AS a bot user (normal message row → threads/reactions/search work).
export async function postBotMessage(bot, { channelId = null, dmConversationId = null, content, buttons = [] }) {
  const msg = await getOne(
    `INSERT INTO messages(workspace_id, channel_id, dm_conversation_id, sender_id, content, message_type)
     VALUES ($1,$2,$3,$4,$5,'bot') RETURNING *`,
    [bot.workspace_id, channelId, dmConversationId, bot.user_id, content]
  );
  for (const b of buttons.slice(0, 5)) {
    await query('INSERT INTO message_buttons(message_id, action_id, label) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [msg.id, b.id, b.label]);
  }
  const full = await getMessage(msg.id);
  const [reactions, mentions, attachments] = await Promise.all([loadReactions([msg.id], bot.user_id), loadMentions([msg.id]), loadAttachments([msg.id])]);
  const buttonsRows = await query('SELECT action_id, label FROM message_buttons WHERE message_id = $1', [msg.id]);
  const out = {
    ...serializeMessage(full, { reactions, mentionIds: mentions[msg.id] || [], attachments }),
    ...(dmConversationId ? { channelId: null, dmConversationId } : {}),
    buttons: buttonsRows.rows,
  };
  const room = dmConversationId ? `dm:${dmConversationId}` : `channel:${channelId}`;
  const type = dmConversationId ? 'dm.message.created' : 'message.created';
  await publish({ type, payload: { message: out } }, [room]);
  return out;
}

function fill(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');
}

// Built-ins (offline-safe, Slack-doc examples): /meeting, /github, /poll.
async function builtin(workspaceId, scope, user, name, args) {
  const at = scope.dmConversationId ? { dmConversationId: scope.dmConversationId } : { channelId: scope.channelId };
  if (name === 'meeting') {
    const sub = args[0] || 'create';
    if (sub !== 'create') return { text: `Usage: /meeting create [title]`, ephemeral: true };
    const title = args.slice(1).join(' ') || 'Quick sync';
    // Huddle tie-in: spin up a call on this conversation for one-tap join.
    const call = await getOne(
      `INSERT INTO calls(workspace_id, channel_id, dm_conversation_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [workspaceId, scope.channelId || null, scope.dmConversationId || null, user.id]
    );
    await query('INSERT INTO call_participants(call_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [call.id, user.id]);
    await publish({ type: 'call.started', payload: { call: { id: call.id }, roster: [] } }, [`workspace:${workspaceId}`]);
    return {
      text: `📅 *${title}* — meeting created by ${user.display_name} (call \`${call.id.slice(0, 8)}\`)`,
      buttons: [{ id: 'join', label: 'Join' }],
      extra: { callId: call.id },
    };
  }
  if (name === 'github') {
    const [sub, env] = args;
    if (sub === 'deploy' && env) {
      return { text: `🚀 Deploying *${env}* — triggered by ${user.display_name} via /github` };
    }
    return { text: `Usage: /github deploy <env> — e.g. \`/github deploy production\``, ephemeral: true };
  }
  if (name === 'poll') {
    const [question, ...opts] = args.join(' ').split(';').map((s) => s.trim()).filter(Boolean);
    if (!question || !opts.length) return { text: `Usage: /poll question?; option A; option B`, ephemeral: true };
    return {
      text: `📊 *${question}* — vote below (posted by ${user.display_name})`,
      buttons: opts.slice(0, 5).map((o, i) => ({ id: `vote-${i}`, label: o })),
    };
  }
  return null;
}

// scope: { channelId } | { dmConversationId }. Returns null when not a command.
export async function executeSlash({ workspaceId, scope, user, text }) {
  if (!text.startsWith('/')) return null;
  const [head, ...args] = text.slice(1).split(/\s+/);
  const name = (head || '').toLowerCase();
  if (!name) return null;

  // 1. Built-ins.
  const builtinRes = await builtin(workspaceId, scope, user, name, args);
  if (builtinRes) {
    if (builtinRes.ephemeral) return { handled: true, ephemeral: builtinRes.text };
    const bots = await query('SELECT * FROM bots WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [workspaceId]);
    const bot = bots.rows[0] || await ensureHelperBot(workspaceId, user.id);
    const out = await postBotMessage(bot, { ...scope, content: builtinRes.text, buttons: builtinRes.buttons || [] });
    return { handled: true, message: out };
  }

  // 2. Registered bot commands (first token must match exactly).
  const cmds = await query(
    `SELECT bc.*, b.user_id AS user_id FROM bot_commands bc JOIN bots b ON b.id = bc.bot_id
     WHERE b.workspace_id = $1 AND bc.command = $2 LIMIT 1`,
    [workspaceId, name]
  );
  if (!cmds.rows.length) return null; // unknown /command → plain message
  const row = cmds.rows[0];
  const bot = { id: row.bot_id, workspace_id: workspaceId, user_id: row.user_id };
  let buttons = [];
  try {
    buttons = typeof row.buttons === 'string' ? JSON.parse(row.buttons) : row.buttons || [];
  } catch {}
  const out = await postBotMessage(bot, {
    ...scope,
    content: fill(row.response_template || `/${name} by ${user.display_name}`, { user: user.display_name, args: args.join(' ') }),
    buttons,
  });
  return { handled: true, message: out };
}

// Fallback bot identity so built-ins work with zero setup (Slack's Slackbot).
async function ensureHelperBot(workspaceId, creatorId) {
  const existing = await getOne(`SELECT * FROM bots WHERE workspace_id = $1 AND name = 'Slackbot' LIMIT 1`, [workspaceId]);
  if (existing) return existing;
  const { randomBytes, createHash } = await import('node:crypto');
  const email = `bot-${randomBytes(6).toString('hex')}@bots.local`;
  const user = await getOne(`INSERT INTO users(email, password_hash, display_name, status) VALUES ($1,'!','Slackbot','ONLINE') RETURNING *`, [email]);
  await query('INSERT INTO workspace_members(workspace_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4)', [workspaceId, user.id, 'bot', creatorId]);
  return getOne('INSERT INTO bots(workspace_id, user_id, name, token_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [workspaceId, user.id, 'Slackbot', createHash('sha256').update(randomBytes(32)).digest('hex'), creatorId]);
}
