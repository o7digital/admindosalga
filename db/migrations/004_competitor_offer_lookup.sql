CREATE INDEX IF NOT EXISTS idx_competitor_offers_latest_by_store
  ON competitor_offers (product_id, store_id, LOWER(competitor_name), captured_at DESC);
