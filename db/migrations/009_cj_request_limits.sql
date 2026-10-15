CREATE TABLE IF NOT EXISTS cj_request_limits (
  account_key TEXT PRIMARY KEY,
  next_request_at TIMESTAMPTZ NOT NULL
);
