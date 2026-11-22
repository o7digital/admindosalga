CREATE TABLE IF NOT EXISTS catalog_sync_status (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  next_page INTEGER NOT NULL DEFAULT 1,
  imported_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  succeeded_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  error_message TEXT
);
