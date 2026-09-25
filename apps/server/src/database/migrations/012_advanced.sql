-- Phase 11: calls, canvas, bots, integrations, workflows, admin/audit.
-- A. Huddles-like calls (WebRTC P2P mesh; server = signaling + roster).
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  dm_conversation_id UUID REFERENCES direct_conversations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'live',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CHECK ((channel_id IS NULL) <> (dm_conversation_id IS NULL))
);
CREATE TABLE IF NOT EXISTS call_participants (
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted BOOLEAN NOT NULL DEFAULT false,
  camera_off BOOLEAN NOT NULL DEFAULT true,
  sharing BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (call_id, user_id)
);

-- B. Canvas docs: block-based docs, versioned LWW blocks converge over WS.
CREATE TABLE IF NOT EXISTS canvas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'Untitled canvas',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS canvas_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES canvas(id) ON DELETE CASCADE,
  kind VARCHAR(24) NOT NULL DEFAULT 'paragraph',
  content TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}',
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canvas_blocks_canvas_idx ON canvas_blocks(canvas_id, position);
CREATE TABLE IF NOT EXISTS canvas_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES canvas(id) ON DELETE CASCADE,
  block_id UUID REFERENCES canvas_blocks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- C. Bots: bot users (users row + workspace role bot) + token + commands.
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bot_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  command VARCHAR(40) NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  response_template TEXT NOT NULL DEFAULT '',
  buttons JSONB NOT NULL DEFAULT '[]',
  UNIQUE (bot_id, command)
);
CREATE TABLE IF NOT EXISTS message_buttons (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  action_id VARCHAR(80) NOT NULL,
  label VARCHAR(80) NOT NULL,
  PRIMARY KEY (message_id, action_id)
);

-- D. Integrations: incoming webhooks + outgoing subscriptions.
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'custom',
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  webhook_token_hash TEXT UNIQUE,
  signing_secret TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{message.created}',
  secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  status INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- E. Workflows: builder (trigger/condition/action) + runs.
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  position INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ok',
  result JSONB NOT NULL DEFAULT '{}',
  run_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- F. Audit log (compliance): privileged actions, VIEW_AUDIT_LOG gated.
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40),
  target_id UUID,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_workspace_idx ON audit_logs(workspace_id, created_at DESC);
