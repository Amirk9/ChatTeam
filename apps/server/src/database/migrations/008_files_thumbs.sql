-- Phase 7 complete: thumbnails + attachment display metadata.
ALTER TABLE files ADD COLUMN IF NOT EXISTS thumb_storage_key TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS thumb_bucket VARCHAR(63);
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS thumb_url TEXT NOT NULL DEFAULT '';
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS width INT;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS height INT;
