-- Phase 7: files + attachments.
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL DEFAULT 'application/octet-stream',
  size BIGINT NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  bucket VARCHAR(63) NOT NULL,
  checksum VARCHAR(64),
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_workspace_idx ON files(workspace_id);
CREATE INDEX IF NOT EXISTS files_message_idx ON files(message_id) WHERE message_id IS NOT NULL;
