import { query } from '@/lib/db';

const schemaSql = `
CREATE TABLE IF NOT EXISTS product_price_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code TEXT NOT NULL CHECK (store_code IN ('MX', 'US')),
  woo_product_id BIGINT NOT NULL,
  external_id TEXT,
  sku TEXT,
  raw_price NUMERIC(14, 4) NOT NULL CHECK (raw_price >= 0),
  raw_currency CHAR(3) NOT NULL CHECK (raw_currency IN ('MXN', 'USD')),
  exchange_rate NUMERIC(20, 8) NOT NULL CHECK (exchange_rate > 0),
  final_price NUMERIC(14, 4) NOT NULL CHECK (final_price >= 0),
  final_currency CHAR(3) NOT NULL CHECK (final_currency IN ('MXN', 'USD')),
  decision_source TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_code, woo_product_id)
);
CREATE INDEX IF NOT EXISTS product_price_registry_external_idx
  ON product_price_registry (external_id);
CREATE INDEX IF NOT EXISTS product_price_registry_sku_idx
  ON product_price_registry (store_code, sku);

CREATE TABLE IF NOT EXISTS product_price_history (
  id BIGSERIAL PRIMARY KEY,
  registry_id UUID NOT NULL REFERENCES product_price_registry(id) ON DELETE CASCADE,
  raw_price NUMERIC(14, 4) NOT NULL,
  raw_currency CHAR(3) NOT NULL,
  exchange_rate NUMERIC(20, 8) NOT NULL,
  final_price NUMERIC(14, 4) NOT NULL,
  final_currency CHAR(3) NOT NULL,
  decision_source TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_price_history_registry_time_idx
  ON product_price_history (registry_id, recorded_at DESC);

DO $$
BEGIN
  IF to_regclass('public.storefront_catalog_products') IS NOT NULL THEN
    INSERT INTO product_price_registry (
      store_code, woo_product_id, external_id, sku, raw_price, raw_currency,
      exchange_rate, final_price, final_currency, decision_source, verified, evidence
    )
    SELECT
      'MX', scp.woo_id, sl.external_id, COALESCE(sl.woo_sku, scp.sku),
      COALESCE(sl.sale_price, scp.price, 0),
      CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(scp.payload->'meta_data', '[]'::JSONB)) meta
        WHERE meta->>'key' = 'dosalga_price_source_currency'
          AND UPPER(meta->>'value') = 'USD'
      ) THEN 'USD' ELSE 'MXN' END,
      COALESCE((
        SELECT CASE WHEN meta->>'value' ~ '^[0-9]+([.][0-9]+)?$' THEN (meta->>'value')::NUMERIC END
        FROM jsonb_array_elements(COALESCE(scp.payload->'meta_data', '[]'::JSONB)) meta
        WHERE meta->>'key' = 'dosalga_mxn_per_usd' LIMIT 1
      ), 17.49),
      COALESCE(scp.price, sl.sale_price, 0), 'MXN',
      'railway-storefront-legacy-register', TRUE,
      jsonb_build_object('catalogSyncedAt', scp.synced_at, 'bootstrap', 'storefront_catalog_products')
    FROM storefront_catalog_products scp
    LEFT JOIN store_listings sl
      ON sl.woo_product_id = scp.woo_id
     AND sl.store_id = (SELECT id FROM stores WHERE code = 'MX' LIMIT 1)
    WHERE scp.store_id = 'MX'
    ON CONFLICT (store_code, woo_product_id) DO NOTHING;
  END IF;
END $$;

INSERT INTO product_price_registry (
  store_code, woo_product_id, external_id, sku, raw_price, raw_currency,
  exchange_rate, final_price, final_currency, decision_source, verified, evidence
)
SELECT s.code, sl.woo_product_id, sl.external_id, sl.woo_sku,
       sl.sale_price, sl.currency_code,
       COALESCE(CASE WHEN sl.metadata->>'exchangeRate' ~ '^[0-9]+([.][0-9]+)?$'
         THEN (sl.metadata->>'exchangeRate')::NUMERIC END, 17.49),
       sl.sale_price, sl.currency_code, 'admin-woo-publication', TRUE,
       jsonb_build_object('publication', sl.metadata->'wooPricePublication')
FROM store_listings sl
JOIN stores s ON s.id = sl.store_id
WHERE sl.woo_product_id IS NOT NULL
  AND sl.sale_price IS NOT NULL
  AND sl.currency_code IN ('USD', 'MXN')
  AND sl.metadata->'wooPricePublication'->>'state' = 'woo_verified'
ON CONFLICT (store_code, woo_product_id) DO UPDATE SET
  external_id = EXCLUDED.external_id, sku = EXCLUDED.sku,
  raw_price = EXCLUDED.raw_price, raw_currency = EXCLUDED.raw_currency,
  exchange_rate = EXCLUDED.exchange_rate, final_price = EXCLUDED.final_price,
  final_currency = EXCLUDED.final_currency, decision_source = EXCLUDED.decision_source,
  verified = TRUE, evidence = EXCLUDED.evidence, updated_at = NOW()
WHERE product_price_registry.decision_source = 'railway-storefront-legacy-register';

INSERT INTO product_price_history (
  registry_id, raw_price, raw_currency, exchange_rate, final_price,
  final_currency, decision_source, verified, evidence
)
SELECT current.id, current.raw_price, current.raw_currency, current.exchange_rate,
       current.final_price, current.final_currency, current.decision_source,
       current.verified, current.evidence
FROM product_price_registry current
WHERE NOT EXISTS (
  SELECT 1 FROM product_price_history previous WHERE previous.registry_id = current.id
);
`;

let schemaPromise;

export const ensurePriceRegistrySchema = () => {
  if (!schemaPromise) {
    schemaPromise = query(schemaSql).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
};
