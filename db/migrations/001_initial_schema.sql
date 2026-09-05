CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('MX', 'US')),
  name TEXT NOT NULL,
  wordpress_url TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  currency_code CHAR(3) NOT NULL CHECK (currency_code IN ('MXN', 'USD')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  canonical_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  description TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'approved', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  variant_name TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, sku)
);

CREATE TABLE store_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES stores(id),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  woo_product_id BIGINT,
  woo_variant_id BIGINT,
  woo_sku TEXT,
  product_url TEXT,
  regular_price NUMERIC(14, 4),
  sale_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL,
  shipping_included BOOLEAN,
  woo_stock_status TEXT,
  woo_stock_quantity NUMERIC(14, 4),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX store_listings_woo_identity_uq
  ON store_listings (store_id, woo_product_id, COALESCE(woo_variant_id, 0))
  WHERE woo_product_id IS NOT NULL;

CREATE TABLE cj_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  cj_pid TEXT NOT NULL,
  cj_vid TEXT,
  cj_sku TEXT,
  cj_product_url TEXT,
  match_status TEXT NOT NULL DEFAULT 'pending' CHECK (match_status IN ('pending', 'matched', 'manual', 'rejected')),
  match_confidence NUMERIC(5, 4) CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX cj_mappings_identity_uq
  ON cj_mappings (product_id, cj_pid, COALESCE(cj_vid, ''));

CREATE TABLE cj_cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cj_mapping_id UUID NOT NULL REFERENCES cj_mappings(id) ON DELETE CASCADE,
  product_cost NUMERIC(14, 4) NOT NULL CHECK (product_cost >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  available_stock NUMERIC(14, 4),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_response JSONB
);

CREATE TABLE shipping_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cj_mapping_id UUID NOT NULL REFERENCES cj_mappings(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id),
  destination_country CHAR(2) NOT NULL,
  destination_postal_code TEXT,
  shipping_method TEXT,
  shipping_cost NUMERIC(14, 4) NOT NULL CHECK (shipping_cost >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  estimated_days_min INTEGER CHECK (estimated_days_min IS NULL OR estimated_days_min >= 0),
  estimated_days_max INTEGER CHECK (estimated_days_max IS NULL OR estimated_days_max >= 0),
  origin_country TEXT,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_response JSONB
);

CREATE TABLE fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency CHAR(3) NOT NULL,
  quote_currency CHAR(3) NOT NULL,
  rate NUMERIC(20, 8) NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (base_currency, quote_currency, captured_at)
);

CREATE TABLE margin_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_listing_id UUID NOT NULL REFERENCES store_listings(id) ON DELETE CASCADE,
  cj_mapping_id UUID REFERENCES cj_mappings(id) ON DELETE SET NULL,
  sale_price NUMERIC(14, 4) NOT NULL,
  product_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  shipping_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  duties_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  payment_fee NUMERIC(14, 4) NOT NULL DEFAULT 0,
  tax_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  return_reserve NUMERIC(14, 4) NOT NULL DEFAULT 0,
  marketing_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  exchange_rate NUMERIC(20, 8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  total_landed_cost NUMERIC(14, 4) NOT NULL,
  gross_margin NUMERIC(14, 4) NOT NULL,
  net_margin NUMERIC(14, 4) NOT NULL,
  margin_percentage NUMERIC(9, 6),
  currency_code CHAR(3) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('woo_mx', 'woo_us', 'cj', 'fx', 'temu')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed')),
  records_processed INTEGER NOT NULL DEFAULT 0 CHECK (records_processed >= 0),
  records_failed INTEGER NOT NULL DEFAULT 0 CHECK (records_failed >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  woo_order_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  currency_code CHAR(3) NOT NULL,
  subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0,
  shipping_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  refund_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  order_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  customer_id BIGINT,
  ordered_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, woo_order_id)
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_listing_id UUID REFERENCES store_listings(id) ON DELETE SET NULL,
  woo_product_id BIGINT,
  woo_variant_id BIGINT,
  sku TEXT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(14, 4),
  estimated_profit NUMERIC(14, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE competitor_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES stores(id),
  competitor_name TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  title TEXT,
  price NUMERIC(14, 4) NOT NULL CHECK (price >= 0),
  currency_code CHAR(3) NOT NULL,
  shipping_cost NUMERIC(14, 4),
  match_confidence NUMERIC(5, 4) CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_name_idx ON products (canonical_name);
CREATE INDEX product_variants_sku_idx ON product_variants (sku);
CREATE INDEX store_listings_product_idx ON store_listings (product_id);
CREATE INDEX store_listings_store_idx ON store_listings (store_id, active);
CREATE INDEX store_listings_woo_sku_idx ON store_listings (woo_sku);
CREATE INDEX store_listings_last_sync_idx ON store_listings (last_synced_at DESC);
CREATE INDEX cj_mappings_product_idx ON cj_mappings (product_id);
CREATE INDEX cj_mappings_pid_idx ON cj_mappings (cj_pid);
CREATE INDEX cj_mappings_vid_idx ON cj_mappings (cj_vid);
CREATE INDEX cj_mappings_sku_idx ON cj_mappings (cj_sku);
CREATE INDEX cj_cost_snapshots_mapping_time_idx ON cj_cost_snapshots (cj_mapping_id, captured_at DESC);
CREATE INDEX shipping_quotes_mapping_store_time_idx ON shipping_quotes (cj_mapping_id, store_id, captured_at DESC);
CREATE INDEX fx_rates_pair_time_idx ON fx_rates (base_currency, quote_currency, captured_at DESC);
CREATE INDEX margin_snapshots_listing_time_idx ON margin_snapshots (store_listing_id, captured_at DESC);
CREATE INDEX sync_runs_source_time_idx ON sync_runs (source, started_at DESC);
CREATE INDEX orders_store_time_idx ON orders (store_id, ordered_at DESC);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX competitor_offers_product_time_idx ON competitor_offers (product_id, captured_at DESC);
CREATE INDEX audit_logs_entity_time_idx ON audit_logs (entity_type, entity_id, created_at DESC);

