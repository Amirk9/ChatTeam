-- Phase 3: workspaces, members, roles, permissions, invites.
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(40) NOT NULL UNIQUE,
  icon_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID REFERENCES users(id),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS permissions (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  permission TEXT NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email CITEXT,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invites_workspace_idx ON invites(workspace_id);

-- Seed roles + permissions (Slack-like matrix, backend-enforced).
INSERT INTO roles(name) VALUES ('owner'),('admin'),('moderator'),('member'),('guest'),('bot')
ON CONFLICT DO NOTHING;

INSERT INTO permissions(name) VALUES
  ('CREATE_CHANNEL'),('DELETE_CHANNEL'),('INVITE_MEMBER'),('REMOVE_MEMBER'),
  ('MANAGE_WORKSPACE'),('MANAGE_INTEGRATIONS'),('DELETE_MESSAGE'),
  ('MANAGE_ROLES'),('VIEW_AUDIT_LOG')
ON CONFLICT DO NOTHING;

-- owner: everything
INSERT INTO role_permissions(role, permission)
SELECT 'owner', name FROM permissions ON CONFLICT DO NOTHING;

-- admin: everything except MANAGE_ROLES (owners only manage roles)
INSERT INTO role_permissions(role, permission)
SELECT 'admin', name FROM permissions WHERE name <> 'MANAGE_ROLES' ON CONFLICT DO NOTHING;

-- moderator: run channels day-to-day
INSERT INTO role_permissions(role, permission) VALUES
  ('moderator','CREATE_CHANNEL'),('moderator','INVITE_MEMBER'),
  ('moderator','REMOVE_MEMBER'),('moderator','DELETE_MESSAGE')
ON CONFLICT DO NOTHING;

-- member: participate
INSERT INTO role_permissions(role, permission) VALUES
  ('member','CREATE_CHANNEL'),('member','INVITE_MEMBER')
ON CONFLICT DO NOTHING;

-- guest + bot: no permissions by default
