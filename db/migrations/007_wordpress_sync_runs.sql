CREATE TABLE IF NOT EXISTS wordpress_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  trigger_name TEXT NOT NULL DEFAULT 'manual',
  imported_count INTEGER NOT NULL DEFAULT 0,
  reports JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wordpress_sync_runs_started_idx
  ON wordpress_sync_runs (started_at DESC);
