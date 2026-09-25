-- Phase 10: crash reports from packaged desktop apps (crashpad endpoint
-- receives JSON summaries; minidumps stay local unless logUpload enabled).
CREATE TABLE IF NOT EXISTS crash_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_version VARCHAR(32) NOT NULL DEFAULT '',
  platform VARCHAR(32) NOT NULL DEFAULT '',
  error TEXT NOT NULL,
  stack TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crash_reports_created_idx ON crash_reports(created_at DESC);
