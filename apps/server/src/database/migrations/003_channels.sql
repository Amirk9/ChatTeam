-- Phase 4: channels + membership.
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name CITEXT NOT NULL,
  slug VARCHAR(40) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  topic VARCHAR(250) NOT NULL DEFAULT '',
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS channels_workspace_idx ON channels(workspace_id);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS channel_members_user_idx ON channel_members(user_id);

-- Backfill #general for workspaces created before this migration (Slack parity:
-- every workspace has a general channel containing all members).
INSERT INTO channels(workspace_id, name, slug, description, is_private, created_by)
SELECT w.id, 'general', 'general', 'Company-wide announcements and chat', false, w.created_by
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM channels c WHERE c.workspace_id = w.id AND c.slug = 'general');

INSERT INTO channel_members(channel_id, user_id, role)
SELECT c.id, wm.user_id, CASE WHEN wm.role = 'owner' THEN 'owner' ELSE 'member' END
FROM channels c JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
WHERE c.slug = 'general'
ON CONFLICT DO NOTHING;
