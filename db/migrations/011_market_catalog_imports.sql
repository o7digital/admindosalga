-- Commerce IDs belong to one market. Pending imports never reuse an MX Woo ID
-- as a US Woo ID and never enter the public storefront snapshot.
CREATE TABLE IF NOT EXISTS storefront_catalog_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_store TEXT NOT NULL REFERENCES stores(code),
  target_store TEXT NOT NULL REFERENCES stores(code),
  source_listing_id UUID NOT NULL REFERENCES store_listings(id),
  target_listing_id UUID NOT NULL REFERENCES store_listings(id),
  sku TEXT NOT NULL CHECK (BTRIM(sku) <> ''),
  source_woo_product_id BIGINT,
  target_woo_product_id BIGINT,
  source_price NUMERIC(14, 4) NOT NULL,
  source_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  review_state TEXT NOT NULL CHECK (review_state IN ('pending_us_review', 'existing_us', 'source_blocked')),
  source_catalog_available BOOLEAN NOT NULL,
  source_payload JSONB NOT NULL,
  source_admin_metadata JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_store <> target_store),
  UNIQUE (target_store, source_listing_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_catalog_imports_market_sku_uq
  ON storefront_catalog_imports (target_store, LOWER(sku));
