-- Phase 9: direct messages (1-1 + group).
-- Decision (plan 09 allowed either): messages are REUSED via
-- messages.dm_conversation_id (channel_id NULL for DMs). One table keeps
-- threads, reactions, mentions, attachments, FTS and file-share flows
-- identical for channels and DMs. Exactly one of channel_id /
-- dm_conversation_id must be set.
CREATE TABLE IF NOT EXISTS direct_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  is_group BOOLEAN NOT NULL DEFAULT false,
  name VARCHAR(80),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS direct_conversations_workspace_idx ON direct_conversations(workspace_id);

CREATE TABLE IF NOT EXISTS direct_conversation_members (
  conversation_id UUID NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS direct_conversation_members_user_idx ON direct_conversation_members(user_id);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS dm_conversation_id UUID REFERENCES direct_conversations(id) ON DELETE CASCADE;
ALTER TABLE messages ALTER COLUMN channel_id DROP NOT NULL;
-- Exactly one home per message (closable quote not needed: IS NULL yields boolean).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_home_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_home_check
      CHECK ((channel_id IS NULL) <> (dm_conversation_id IS NULL));
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS messages_dm_created_idx ON messages(dm_conversation_id, created_at DESC, id DESC);
