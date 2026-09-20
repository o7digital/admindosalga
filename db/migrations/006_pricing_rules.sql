CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_slug TEXT NOT NULL,
  source_currency CHAR(3) NOT NULL CHECK (source_currency IN ('MXN', 'USD')),
  display_currency CHAR(3) NOT NULL CHECK (display_currency IN ('MXN', 'USD')),
  price_mode TEXT NOT NULL DEFAULT 'native' CHECK (price_mode IN ('native', 'storefront', 'convert')),
  exchange_rate NUMERIC(20, 8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, category_slug)
);

CREATE INDEX pricing_rules_store_category_idx ON pricing_rules (store_id, category_slug);

INSERT INTO pricing_rules (
  store_id, category_slug, source_currency, display_currency, price_mode, exchange_rate, notes
)
SELECT id, 'caps', 'MXN', 'MXN', 'native', 1,
       'CAPS: use the native WooCommerce MXN price; never multiply by USD/MXN.'
FROM stores
WHERE code = 'MX'
ON CONFLICT (store_id, category_slug) DO NOTHING;
