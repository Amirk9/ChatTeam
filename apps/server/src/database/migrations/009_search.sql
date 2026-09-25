-- Phase 8: full-text search (PG FTS, pg_trgm). OpenSearch can replace later
-- without API change (SearchService abstraction).
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Messages FTS vector + trigger + GIN index.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR;
CREATE OR REPLACE FUNCTION messages_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS messages_tsv_update ON messages;
CREATE TRIGGER messages_tsv_update BEFORE INSERT OR UPDATE OF content ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_tsv_trigger();
-- Backfill existing rows (trigger only fires on write).
UPDATE messages SET content = content WHERE content_tsv IS NULL;
CREATE INDEX IF NOT EXISTS messages_content_tsv_idx ON messages USING GIN (content_tsv);

-- Trigram indexes for name/email/filename lookups (Slack quick-switch).
CREATE INDEX IF NOT EXISTS channels_name_trgm_idx ON channels USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS channels_desc_trgm_idx ON channels USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_display_trgm_idx ON users USING GIN (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_email_trgm_idx ON users USING GIN (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS files_filename_trgm_idx ON files USING GIN (filename gin_trgm_ops);
