import { normalizeWooPrice } from './wooPricing.mjs';
import { overlayCjSnapshot } from './cjData.mjs';
import { applyPriceRegistry, registryFromProduct } from './priceRegistry.mjs';
import { ensurePriceRegistrySchema } from './priceRegistrySchema';
import { isDatabaseConfigured, query, withTransaction } from '@/lib/db';

const siteToStoreCode = (siteId) => siteId === 'dosalga-usa' ? 'US' : 'MX';
const storeCodeToSite = (code) => code === 'US' ? 'dosalga-usa' : 'dosalga-mexico';

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const wooProductIdFromExternalId = (externalId) => {
  const match = String(externalId || '').match(/^wp-dosalga-(?:mexico|usa)-(\d+)$/);
  return match ? Number(match[1]) : null;
};

const listingExternalId = (product) => (
  String(product.id || '').trim() || `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

const upsertOne = async (client, product) => {
  product = normalizeWooPrice(product);
  const externalId = listingExternalId(product);
  const storeCode = siteToStoreCode(product.siteId);
  const sku = String(product.sku || '').trim();
  const existing = await client.query(`
    SELECT p.id
    FROM products p
    LEFT JOIN store_listings sl ON sl.product_id = p.id
    WHERE p.external_id = $1
       OR sl.external_id = $1
       OR ($2 <> '' AND sl.woo_sku = $2)
    ORDER BY CASE WHEN sl.external_id = $1 THEN 0 ELSE 1 END
    LIMIT 1
  `, [externalId, sku]);

  let productId = existing.rows[0]?.id;
  if (productId) {
    await client.query(`
      UPDATE products
      SET canonical_name = $2,
          brand = $3,
          category = $4,
          image_url = NULLIF($5, ''),
          status = $6,
          metadata = metadata || $7::JSONB
      WHERE id = $1
    `, [
      productId,
      product.name || 'Untitled product',
      product.brand || 'Dosalga',
      product.category || 'General',
      product.imageUrl || '',
      product.archived ? 'archived' : (product.status || 'review'),
      JSON.stringify({ supplier: product.supplier || null }),
    ]);
  } else {
    const inserted = await client.query(`
      INSERT INTO products (
        external_id, canonical_name, brand, category, image_url, status, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7::JSONB, COALESCE($8::TIMESTAMPTZ, NOW()), NOW())
      RETURNING id
    `, [
      externalId,
      product.name || 'Untitled product',
      product.brand || 'Dosalga',
      product.category || 'General',
      product.imageUrl || '',
      product.archived ? 'archived' : (product.status || 'review'),
      JSON.stringify({ supplier: product.supplier || null }),
      product.createdAt || null,
    ]);
    productId = inserted.rows[0].id;
  }

  const storeResult = await client.query('SELECT id, currency_code FROM stores WHERE code = $1', [storeCode]);
  if (!storeResult.rowCount) throw new Error(`Store ${storeCode} is not configured.`);
  const store = storeResult.rows[0];
  const wooProductId = wooProductIdFromExternalId(externalId);

  const listingResult = await client.query(`
    INSERT INTO store_listings (
      external_id, store_id, product_id, woo_product_id, woo_sku, product_url,
      regular_price, sale_price, currency_code, shipping_included,
      woo_stock_status, woo_stock_quantity, active, last_synced_at, metadata, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''),
      $7, $7, $8, $9,
      $10, $11, $12, COALESCE($13::TIMESTAMPTZ, NOW()), $14::JSONB,
      COALESCE($15::TIMESTAMPTZ, NOW()), NOW()
    )
    ON CONFLICT (external_id) DO UPDATE SET
      store_id = EXCLUDED.store_id,
      product_id = EXCLUDED.product_id,
      woo_product_id = COALESCE(EXCLUDED.woo_product_id, store_listings.woo_product_id),
      woo_sku = EXCLUDED.woo_sku,
      product_url = EXCLUDED.product_url,
      regular_price = EXCLUDED.regular_price,
      sale_price = EXCLUDED.sale_price,
      currency_code = EXCLUDED.currency_code,
      shipping_included = EXCLUDED.shipping_included,
      woo_stock_status = EXCLUDED.woo_stock_status,
      woo_stock_quantity = EXCLUDED.woo_stock_quantity,
      active = EXCLUDED.active,
      last_synced_at = EXCLUDED.last_synced_at,
      metadata = (EXCLUDED.metadata - 'cjPriceProposal' - 'cjPricePublication' - 'wooPricePublication' - 'wooFrozen' - 'wooFreeze' - 'sourcePrice' - 'sourceCurrency' - 'sourceManagedByAdmin') || CASE
          WHEN store_listings.metadata ? 'cjPriceProposal'
          THEN jsonb_build_object('cjPriceProposal', store_listings.metadata->'cjPriceProposal')
          ELSE '{}'::jsonb END || CASE WHEN store_listings.metadata ? 'cjPricePublication' THEN jsonb_build_object('cjPricePublication', store_listings.metadata->'cjPricePublication') ELSE '{}'::jsonb END
          || CASE WHEN store_listings.metadata ? 'wooPricePublication' THEN jsonb_build_object('wooPricePublication', store_listings.metadata->'wooPricePublication') ELSE '{}'::jsonb END
          || CASE WHEN store_listings.metadata ? 'wooFrozen' THEN jsonb_build_object('wooFrozen', store_listings.metadata->'wooFrozen') ELSE '{}'::jsonb END
          || CASE WHEN store_listings.metadata ? 'wooFreeze' THEN jsonb_build_object('wooFreeze', store_listings.metadata->'wooFreeze') ELSE '{}'::jsonb END
          || CASE WHEN COALESCE((store_listings.metadata->>'sourceManagedByAdmin')::boolean, false) THEN jsonb_build_object('sourcePrice', store_listings.metadata->'sourcePrice', 'sourceCurrency', store_listings.metadata->'sourceCurrency', 'sourceManagedByAdmin', true) ELSE jsonb_build_object('sourcePrice', EXCLUDED.metadata->'sourcePrice', 'sourceCurrency', EXCLUDED.metadata->'sourceCurrency', 'sourceManagedByAdmin', COALESCE(EXCLUDED.metadata->'sourceManagedByAdmin', 'false'::jsonb)) END
    RETURNING id
  `, [
    externalId,
    store.id,
    productId,
    wooProductId,
    sku,
    product.productUrl || '',
    numeric(product.salePrice),
    product.saleCurrency || store.currency_code,
    product.shippingIncluded === undefined ? null : Boolean(product.shippingIncluded),
    numeric(product.stock) > 0 ? 'instock' : 'outofstock',
    numeric(product.stock),
    !product.archived,
    product.lastWooImportAt || product.updatedAt || null,
    JSON.stringify({ ...product, id: externalId }),
    product.createdAt || null,
  ]);

  const cjPid = String(product.pid || '').trim();
  const cjSku = String(product.cjSku || '').trim();
  if (cjPid || cjSku) {
    const mappingResult = await client.query(`
      INSERT INTO cj_mappings (
        product_id, cj_pid, cj_sku, cj_product_url, match_status, match_confidence
      ) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6)
      ON CONFLICT (product_id, cj_pid, (COALESCE(cj_vid, ''))) DO UPDATE SET
        cj_sku = EXCLUDED.cj_sku,
        cj_product_url = EXCLUDED.cj_product_url,
        match_status = EXCLUDED.match_status,
        match_confidence = EXCLUDED.match_confidence,
        updated_at = NOW()
      RETURNING id
    `, [
      productId,
      cjPid || cjSku,
      cjSku,
      product.cjProductUrl || '',
      product.lastCjSyncAt ? 'matched' : 'pending',
      product.lastCjSyncAt ? 1 : null,
    ]);
    const mappingId = mappingResult.rows[0].id;

    if (numeric(product.cjCostUsd) > 0) {
      await client.query(`
        INSERT INTO cj_cost_snapshots (cj_mapping_id, product_cost, currency_code, available_stock, captured_at)
        VALUES ($1, $2, $3, $4, COALESCE($5::TIMESTAMPTZ, NOW()))
      `, [
        mappingId,
        numeric(product.cjCostUsd),
        product.cjCostCurrency || 'USD',
        product.cjStock === undefined || product.cjStock === null ? null : numeric(product.cjStock),
        product.lastCjSyncAt || null,
      ]);
    }

    if (numeric(product.shippingUsd) > 0) {
      await client.query(`
        INSERT INTO shipping_quotes (
          cj_mapping_id, store_id, destination_country, shipping_method, shipping_cost,
          currency_code, estimated_days_min, estimated_days_max, origin_country, captured_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::TIMESTAMPTZ, NOW()))
      `, [
        mappingId,
        store.id,
        storeCode,
        product.transportMethod || null,
        numeric(product.shippingUsd),
        product.shippingCurrency || 'USD',
        numeric(product.minDeliveryDays) || null,
        numeric(product.maxDeliveryDays) || null,
        product.shippingOrigin || null,
        product.lastCjSyncAt || null,
      ]);
    }
  }

  return { externalId, listingId: listingResult.rows[0].id };
};

export const databaseIsAvailable = isDatabaseConfigured;

const toImportRecord = (product) => {
  product = normalizeWooPrice(product);
  const priceRegistry = registryFromProduct(product);
  const externalId = listingExternalId(product);
  const sku = String(product.sku || '').trim();
  const cjPid = String(product.pid || '').trim();
  const cjSku = String(product.cjSku || '').trim();
  const storeCode = siteToStoreCode(product.siteId);
  const hasCjMatch = Boolean(product.lastCjSyncAt || product.supplier === 'CJ');

  return {
    external_id: externalId,
    canonical_key: sku ? `sku:${sku.toLowerCase()}` : `external:${externalId}`,
    store_code: storeCode,
    name: product.name || 'Untitled product',
    brand: product.brand || 'Dosalga',
    category: product.category || 'General',
    image_url: product.imageUrl || '',
    status: product.archived ? 'archived' : (product.status || 'review'),
    sku,
    woo_product_id: wooProductIdFromExternalId(externalId),
    product_url: product.productUrl || '',
    sale_price: numeric(product.salePrice),
    currency_code: product.saleCurrency || (storeCode === 'US' ? 'USD' : 'MXN'),
    shipping_included: product.shippingIncluded === undefined ? null : Boolean(product.shippingIncluded),
    stock: numeric(product.stock),
    active: !product.archived,
    last_sync: product.lastWooImportAt || product.updatedAt || new Date().toISOString(),
    created_at: product.createdAt || new Date().toISOString(),
    payload: { ...product, id: externalId },
    cj_pid: hasCjMatch ? (cjPid || cjSku) : '',
    cj_sku: hasCjMatch ? cjSku : '',
    cj_url: hasCjMatch ? (product.cjProductUrl || '') : '',
    last_cj_sync: product.lastCjSyncAt || null,
    cj_cost: numeric(product.cjCostUsd),
    cj_cost_currency: product.cjCostCurrency || 'USD',
    cj_stock: product.cjStock === undefined || product.cjStock === null ? null : numeric(product.cjStock),
    shipping_cost: numeric(product.shippingUsd),
    shipping_currency: product.shippingCurrency || 'USD',
    destination_country: storeCode,
    shipping_method: product.transportMethod || null,
    min_days: numeric(product.minDeliveryDays) || null,
    max_days: numeric(product.maxDeliveryDays) || null,
    origin_country: product.shippingOrigin || null,
    price_raw: priceRegistry?.rawPrice ?? null,
    price_raw_currency: priceRegistry?.rawCurrency ?? null,
    price_exchange_rate: priceRegistry?.exchangeRate ?? null,
    price_final: priceRegistry?.finalPrice ?? null,
    price_final_currency: priceRegistry?.finalCurrency ?? null,
    price_decision_source: priceRegistry?.decisionSource ?? null,
    price_verified: priceRegistry?.verified === true,
    price_evidence: priceRegistry?.evidence || {},
  };
};

const stageSql = `
  SELECT * FROM jsonb_to_recordset($1::JSONB) AS x(
    external_id TEXT,
    canonical_key TEXT,
    store_code TEXT,
    name TEXT,
    brand TEXT,
    category TEXT,
    image_url TEXT,
    status TEXT,
    sku TEXT,
    woo_product_id BIGINT,
    product_url TEXT,
    sale_price NUMERIC,
    currency_code TEXT,
    shipping_included BOOLEAN,
    stock NUMERIC,
    active BOOLEAN,
    last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    payload JSONB,
    cj_pid TEXT,
    cj_sku TEXT,
    cj_url TEXT,
    last_cj_sync TIMESTAMPTZ,
    cj_cost NUMERIC,
    cj_cost_currency TEXT,
    cj_stock NUMERIC,
    shipping_cost NUMERIC,
    shipping_currency TEXT,
    destination_country TEXT,
    shipping_method TEXT,
    min_days INTEGER,
    max_days INTEGER,
    origin_country TEXT
    ,price_raw NUMERIC
    ,price_raw_currency TEXT
    ,price_exchange_rate NUMERIC
    ,price_final NUMERIC
    ,price_final_currency TEXT
    ,price_decision_source TEXT
    ,price_verified BOOLEAN
    ,price_evidence JSONB
  )
`;

export const upsertProducts = async (products) => {
  if (!products.length) return [];
  await ensurePriceRegistrySchema();
  const records = products.map(toImportRecord);
  const payload = JSON.stringify(records);

  return withTransaction(async (client) => {
    await client.query(`
      WITH staged AS (${stageSql}), canonical AS (
        SELECT DISTINCT ON (canonical_key) *
        FROM staged
        ORDER BY canonical_key, last_sync DESC
      )
      INSERT INTO products (
        external_id, canonical_name, brand, category, image_url, status, metadata, created_at, updated_at
      )
      SELECT canonical_key, name, brand, category, NULLIF(image_url, ''), status,
             jsonb_build_object('supplier', payload->>'supplier'), created_at, NOW()
      FROM canonical
      ON CONFLICT (external_id) DO UPDATE SET
        canonical_name = EXCLUDED.canonical_name,
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
        status = EXCLUDED.status,
        metadata = products.metadata || EXCLUDED.metadata
    `, [payload]);

    await client.query(`
      WITH staged AS (${stageSql})
      INSERT INTO store_listings (
        external_id, store_id, product_id, woo_product_id, woo_sku, product_url,
        regular_price, sale_price, currency_code, shipping_included,
        woo_stock_status, woo_stock_quantity, active, last_synced_at, metadata, created_at, updated_at
      )
      SELECT staged.external_id, stores.id, products.id, staged.woo_product_id,
             NULLIF(staged.sku, ''), NULLIF(staged.product_url, ''),
             staged.sale_price, staged.sale_price, staged.currency_code,
             staged.shipping_included,
             CASE WHEN staged.stock > 0 THEN 'instock' ELSE 'outofstock' END,
             staged.stock, staged.active, staged.last_sync, staged.payload,
             staged.created_at, NOW()
      FROM staged
      JOIN stores ON stores.code = staged.store_code
      JOIN products ON products.external_id = staged.canonical_key
      ON CONFLICT (external_id) DO UPDATE SET
        store_id = EXCLUDED.store_id,
        product_id = EXCLUDED.product_id,
        woo_product_id = COALESCE(EXCLUDED.woo_product_id, store_listings.woo_product_id),
        woo_sku = EXCLUDED.woo_sku,
        product_url = EXCLUDED.product_url,
        regular_price = EXCLUDED.regular_price,
        sale_price = EXCLUDED.sale_price,
        currency_code = EXCLUDED.currency_code,
        shipping_included = EXCLUDED.shipping_included,
        woo_stock_status = EXCLUDED.woo_stock_status,
        woo_stock_quantity = EXCLUDED.woo_stock_quantity,
        active = EXCLUDED.active,
        last_synced_at = EXCLUDED.last_synced_at,
        metadata = (EXCLUDED.metadata - 'cjPriceProposal' - 'cjPricePublication' - 'wooPricePublication' - 'wooFrozen' - 'wooFreeze' - 'sourcePrice' - 'sourceCurrency' - 'sourceManagedByAdmin') || CASE
          WHEN store_listings.metadata ? 'cjPriceProposal'
          THEN jsonb_build_object('cjPriceProposal', store_listings.metadata->'cjPriceProposal')
          ELSE '{}'::jsonb END || CASE WHEN store_listings.metadata ? 'cjPricePublication' THEN jsonb_build_object('cjPricePublication', store_listings.metadata->'cjPricePublication') ELSE '{}'::jsonb END
          || CASE WHEN store_listings.metadata ? 'wooPricePublication' THEN jsonb_build_object('wooPricePublication', store_listings.metadata->'wooPricePublication') ELSE '{}'::jsonb END
          || CASE WHEN store_listings.metadata ? 'wooFrozen' THEN jsonb_build_object('wooFrozen', store_listings.metadata->'wooFrozen') ELSE '{}'::jsonb END
          || CASE WHEN store_listings.metadata ? 'wooFreeze' THEN jsonb_build_object('wooFreeze', store_listings.metadata->'wooFreeze') ELSE '{}'::jsonb END
          || CASE WHEN COALESCE((store_listings.metadata->>'sourceManagedByAdmin')::boolean, false) THEN jsonb_build_object('sourcePrice', store_listings.metadata->'sourcePrice', 'sourceCurrency', store_listings.metadata->'sourceCurrency', 'sourceManagedByAdmin', true) ELSE jsonb_build_object('sourcePrice', EXCLUDED.metadata->'sourcePrice', 'sourceCurrency', EXCLUDED.metadata->'sourceCurrency', 'sourceManagedByAdmin', COALESCE(EXCLUDED.metadata->'sourceManagedByAdmin', 'false'::jsonb)) END
    `, [payload]);

    await client.query(`
      WITH staged AS (${stageSql}), upserted AS (
        INSERT INTO product_price_registry (
          store_code, woo_product_id, external_id, sku, raw_price, raw_currency,
          exchange_rate, final_price, final_currency, decision_source, verified, evidence
        )
        SELECT staged.store_code, staged.woo_product_id, staged.external_id,
               NULLIF(staged.sku, ''), staged.price_raw, staged.price_raw_currency,
               staged.price_exchange_rate, staged.price_final, staged.price_final_currency,
               staged.price_decision_source, staged.price_verified,
               COALESCE(staged.price_evidence, '{}'::JSONB)
        FROM staged
        WHERE staged.woo_product_id IS NOT NULL
          AND staged.price_raw IS NOT NULL
          AND staged.price_raw_currency IN ('USD', 'MXN')
          AND staged.price_final IS NOT NULL
          AND staged.price_final_currency IN ('USD', 'MXN')
          AND staged.price_exchange_rate > 0
        ON CONFLICT (store_code, woo_product_id) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          sku = EXCLUDED.sku,
          raw_price = CASE WHEN EXCLUDED.verified OR NOT product_price_registry.verified THEN EXCLUDED.raw_price ELSE product_price_registry.raw_price END,
          raw_currency = CASE WHEN EXCLUDED.verified OR NOT product_price_registry.verified THEN EXCLUDED.raw_currency ELSE product_price_registry.raw_currency END,
          exchange_rate = CASE WHEN EXCLUDED.verified OR NOT product_price_registry.verified THEN EXCLUDED.exchange_rate ELSE product_price_registry.exchange_rate END,
          final_price = CASE WHEN EXCLUDED.verified OR NOT product_price_registry.verified THEN EXCLUDED.final_price ELSE product_price_registry.final_price END,
          final_currency = CASE WHEN EXCLUDED.verified OR NOT product_price_registry.verified THEN EXCLUDED.final_currency ELSE product_price_registry.final_currency END,
          decision_source = CASE WHEN EXCLUDED.verified OR NOT product_price_registry.verified THEN EXCLUDED.decision_source ELSE product_price_registry.decision_source END,
          verified = product_price_registry.verified OR EXCLUDED.verified,
          evidence = CASE WHEN EXCLUDED.verified OR NOT product_price_registry.verified THEN EXCLUDED.evidence ELSE product_price_registry.evidence END,
          updated_at = NOW()
        RETURNING *
      )
      INSERT INTO product_price_history (
        registry_id, raw_price, raw_currency, exchange_rate, final_price,
        final_currency, decision_source, verified, evidence
      )
      SELECT id, raw_price, raw_currency, exchange_rate, final_price,
             final_currency, decision_source, verified, evidence
      FROM upserted current
      WHERE NOT EXISTS (
        SELECT 1 FROM product_price_history previous
        WHERE previous.registry_id = current.id
          AND previous.raw_price = current.raw_price
          AND previous.raw_currency = current.raw_currency
          AND previous.exchange_rate = current.exchange_rate
          AND previous.final_price = current.final_price
          AND previous.final_currency = current.final_currency
          AND previous.decision_source = current.decision_source
          AND previous.verified = current.verified
      )
    `, [payload]);

    await client.query(`
      WITH staged AS (${stageSql})
      INSERT INTO cj_mappings (
        product_id, cj_pid, cj_sku, cj_product_url, match_status, match_confidence
      )
      SELECT products.id, staged.cj_pid, NULLIF(staged.cj_sku, ''), NULLIF(staged.cj_url, ''),
             CASE WHEN staged.last_cj_sync IS NULL THEN 'pending' ELSE 'matched' END,
             CASE WHEN staged.last_cj_sync IS NULL THEN NULL ELSE 1 END
      FROM staged
      JOIN products ON products.external_id = staged.canonical_key
      WHERE staged.cj_pid <> ''
      ON CONFLICT (product_id, cj_pid, (COALESCE(cj_vid, ''))) DO UPDATE SET
        cj_sku = EXCLUDED.cj_sku,
        cj_product_url = EXCLUDED.cj_product_url,
        match_status = EXCLUDED.match_status,
        match_confidence = EXCLUDED.match_confidence,
        updated_at = NOW()
    `, [payload]);

    await client.query(`
      WITH staged AS (${stageSql})
      INSERT INTO cj_cost_snapshots (
        cj_mapping_id, product_cost, currency_code, available_stock, captured_at
      )
      SELECT mappings.id, staged.cj_cost, staged.cj_cost_currency, staged.cj_stock,
             COALESCE(staged.last_cj_sync, NOW())
      FROM staged
      JOIN products ON products.external_id = staged.canonical_key
      JOIN cj_mappings mappings
        ON mappings.product_id = products.id
       AND mappings.cj_pid = staged.cj_pid
       AND mappings.cj_vid IS NULL
      WHERE staged.cj_pid <> '' AND staged.cj_cost > 0
    `, [payload]);

    await client.query(`
      WITH staged AS (${stageSql})
      INSERT INTO shipping_quotes (
        cj_mapping_id, store_id, destination_country, shipping_method, shipping_cost,
        currency_code, estimated_days_min, estimated_days_max, origin_country, captured_at
      )
      SELECT mappings.id, stores.id, staged.destination_country, staged.shipping_method,
             staged.shipping_cost, staged.shipping_currency, staged.min_days, staged.max_days,
             staged.origin_country, COALESCE(staged.last_cj_sync, NOW())
      FROM staged
      JOIN stores ON stores.code = staged.store_code
      JOIN products ON products.external_id = staged.canonical_key
      JOIN cj_mappings mappings
        ON mappings.product_id = products.id
       AND mappings.cj_pid = staged.cj_pid
       AND mappings.cj_vid IS NULL
      WHERE staged.cj_pid <> '' AND staged.shipping_cost > 0
    `, [payload]);

    return records.map((record) => ({ externalId: record.external_id }));
  });
};

export const listProducts = async () => {
  await ensurePriceRegistrySchema();
  const result = await query(`
    SELECT
      sl.external_id,
      sl.metadata,
      sl.sale_price,
      sl.currency_code,
      sl.shipping_included,
      sl.woo_stock_quantity,
      sl.active,
      sl.last_synced_at,
      s.code AS store_code,
      p.canonical_name,
      p.brand,
      p.category,
      p.image_url,
      p.status,
      p.created_at,
      p.updated_at,
      cj.cj_pid,
      cj.cj_sku,
      cj.cj_product_url,
      cj.product_cost AS cj_product_cost,
      cj.currency_code AS cj_cost_currency,
      cj.available_stock AS cj_available_stock,
      cj.captured_at AS cj_captured_at,
      price_registry.raw_price AS registry_raw_price,
      price_registry.raw_currency AS registry_raw_currency,
      price_registry.exchange_rate AS registry_exchange_rate,
      price_registry.final_price AS registry_final_price,
      price_registry.final_currency AS registry_final_currency,
      price_registry.decision_source AS registry_decision_source,
      price_registry.verified AS registry_verified,
      price_registry.evidence AS registry_evidence,
      price_registry.updated_at AS registry_updated_at,
      competitors.offers AS competitor_offers
    FROM store_listings sl
    JOIN stores s ON s.id = sl.store_id
    JOIN products p ON p.id = sl.product_id
    LEFT JOIN product_price_registry price_registry
      ON price_registry.store_code = s.code
     AND price_registry.woo_product_id = sl.woo_product_id
    LEFT JOIN LATERAL (
      SELECT mappings.cj_pid,
             mappings.cj_sku,
             mappings.cj_product_url,
             snapshot.product_cost,
             snapshot.currency_code,
             snapshot.available_stock,
             snapshot.captured_at
      FROM cj_mappings mappings
      LEFT JOIN LATERAL (
        SELECT product_cost, currency_code, available_stock, captured_at
        FROM cj_cost_snapshots
        WHERE cj_mapping_id = mappings.id
          AND product_cost > 0
        ORDER BY captured_at DESC
        LIMIT 1
      ) snapshot ON TRUE
      WHERE mappings.product_id = p.id
      ORDER BY (snapshot.captured_at IS NOT NULL) DESC,
               snapshot.captured_at DESC,
               mappings.updated_at DESC
      LIMIT 1
    ) cj ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(latest.competitor_key, latest.offer) AS offers
      FROM (
        SELECT DISTINCT ON (LOWER(co.competitor_name))
          LOWER(co.competitor_name) AS competitor_key,
          jsonb_build_object(
            'price', co.price,
            'shippingCost', co.shipping_cost,
            'shippingIncluded', co.shipping_included,
            'currencyCode', co.currency_code,
            'url', co.competitor_url,
            'capturedAt', co.captured_at
          ) AS offer
        FROM competitor_offers co
        WHERE co.product_id = p.id
          AND co.store_id = sl.store_id
          AND LOWER(co.competitor_name) IN ('temu', 'amazon')
        ORDER BY LOWER(co.competitor_name), co.captured_at DESC
      ) latest
    ) competitors ON TRUE
    ORDER BY p.updated_at DESC, p.canonical_name
  `);

  return result.rows.map((row) => applyPriceRegistry({
    ...overlayCjSnapshot(row.metadata || {}, {
      pid: row.cj_pid,
      sku: row.cj_sku,
      productUrl: row.cj_product_url,
      productCost: row.cj_product_cost,
      currency: row.cj_cost_currency,
      availableStock: row.cj_available_stock,
      capturedAt: row.cj_captured_at,
    }),
    id: row.external_id,
    siteId: storeCodeToSite(row.store_code),
    stores: [storeCodeToSite(row.store_code)],
    name: row.canonical_name,
    brand: row.brand || row.metadata?.brand || 'Dosalga',
    category: row.category || row.metadata?.category || 'General',
    imageUrl: row.image_url || row.metadata?.imageUrl || '',
    salePrice: numeric(row.sale_price),
    saleCurrency: row.currency_code,
    shippingIncluded: row.shipping_included,
    stock: numeric(row.woo_stock_quantity),
    status: row.status,
    archived: !row.active || row.status === 'archived',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastWooImportAt: row.last_synced_at,
    competitors: row.competitor_offers || {},
  }, row.registry_raw_currency ? {
    rawPrice: row.registry_raw_price,
    rawCurrency: row.registry_raw_currency,
    exchangeRate: row.registry_exchange_rate,
    finalPrice: row.registry_final_price,
    finalCurrency: row.registry_final_currency,
    decisionSource: row.registry_decision_source,
    verified: row.registry_verified,
    evidence: row.registry_evidence,
    updatedAt: row.registry_updated_at,
  } : null)).map(normalizeWooPrice);
};

export const saveCompetitorOffer = async ({ externalId, competitorName, price, shippingCost = 0, shippingIncluded = true, url = '' }) => withTransaction(async (client) => {
  const competitor = String(competitorName || '').trim().toLowerCase();
  if (!['temu', 'amazon'].includes(competitor)) throw new Error('Competitor must be Temu or Amazon.');

  const listing = await client.query(`
    SELECT sl.product_id, sl.store_id, sl.currency_code
    FROM store_listings sl
    WHERE sl.external_id = $1
  `, [externalId]);
  if (!listing.rowCount) return null;

  const row = listing.rows[0];
  const result = await client.query(`
    INSERT INTO competitor_offers (
      product_id, store_id, competitor_name, competitor_url, price,
      currency_code, shipping_cost, shipping_included, match_confidence, captured_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW())
    RETURNING price, shipping_cost, shipping_included, currency_code, competitor_url, captured_at
  `, [row.product_id, row.store_id, competitor === 'temu' ? 'Temu' : 'Amazon', url, price, row.currency_code, shippingCost, Boolean(shippingIncluded)]);

  return {
    price: numeric(result.rows[0].price),
    shippingCost: numeric(result.rows[0].shipping_cost),
    shippingIncluded: result.rows[0].shipping_included,
    currencyCode: result.rows[0].currency_code,
    url: result.rows[0].competitor_url || '',
    capturedAt: result.rows[0].captured_at,
  };
});

export const archiveProduct = async (externalId) => withTransaction(async (client) => {
  const result = await client.query(`
    UPDATE store_listings
    SET active = FALSE,
        metadata = metadata || '{"archived": true, "status": "archived"}'::JSONB
    WHERE external_id = $1
    RETURNING product_id
  `, [externalId]);
  if (!result.rowCount) return false;

  await client.query(`
    UPDATE products p
    SET status = 'archived'
    WHERE p.id = $1
      AND NOT EXISTS (
        SELECT 1 FROM store_listings sl WHERE sl.product_id = p.id AND sl.active = TRUE
      )
  `, [result.rows[0].product_id]);
  return true;
});

export const saveWooFreezeState = async (externalId, freeze) => {
  const frozenAt = new Date().toISOString();
  const state = {
    status: freeze.status,
    catalogVisibility: freeze.catalogVisibility,
    alreadyFrozen: Boolean(freeze.alreadyFrozen),
    frozenAt,
  };
  const result = await query(`
    UPDATE store_listings
    SET metadata = jsonb_set(
          jsonb_set(metadata, '{wooFrozen}', 'true'::jsonb, TRUE),
          '{wooFreeze}', $2::jsonb, TRUE
        ),
        updated_at = NOW()
    WHERE external_id = $1 AND active = TRUE
    RETURNING metadata->'wooFreeze' AS freeze
  `, [externalId, JSON.stringify(state)]);
  return result.rows[0]?.freeze || null;
};

export const updateProductImage = async (externalId, imageUrl) => withTransaction(async (client) => {
  const listingResult = await client.query(`
    UPDATE store_listings
    SET metadata = jsonb_set(metadata, '{imageUrl}', to_jsonb($2::TEXT), TRUE)
    WHERE external_id = $1
    RETURNING product_id
  `, [externalId, imageUrl]);
  if (!listingResult.rowCount) return false;

  await client.query('UPDATE products SET image_url = $2 WHERE id = $1', [
    listingResult.rows[0].product_id,
    imageUrl,
  ]);
  return true;
});

// Update only this listing's proposal, leaving live prices and the other market intact.
export const saveCjPriceProposal = async (externalId, proposal) => {
  const result = await query(`
    UPDATE store_listings
    SET metadata = jsonb_set(metadata, '{cjPriceProposal}', $2::jsonb), updated_at = NOW()
    WHERE external_id = $1 AND active = TRUE AND currency_code = $3
    RETURNING metadata->'cjPriceProposal' AS proposal
  `, [externalId, JSON.stringify(proposal), proposal.currency]);
  return result.rows[0]?.proposal || null;
};

export async function beginCjPublication(externalId, savedAt) {
  const result = await query(`
    UPDATE store_listings SET metadata = jsonb_set(metadata, '{cjPricePublication}',
      jsonb_build_object('state', 'sending', 'operation', gen_random_uuid()::text, 'at', NOW(), 'proposalSavedAt', $2::text))
    WHERE external_id = $1 AND active = TRUE
      AND metadata->'cjPriceProposal'->>'savedAt' = $2
      AND COALESCE(metadata->'cjPricePublication'->>'state', '') NOT IN ('sending', 'unknown')
      AND COALESCE(metadata->'cjPricePublication'->>'proposalSavedAt', '') <> $2
    RETURNING metadata->'cjPricePublication'->>'operation' AS operation
  `, [externalId, savedAt]);
  return result.rows[0]?.operation || null;
}

const confirmedWooPublication = (publication) => {
  const price = Number(publication?.price);
  const currency = String(publication?.currency || '').trim().toUpperCase();
  if (publication?.state !== 'woo_verified' || !Number.isFinite(price) || price <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    return { price: null, currency: null };
  }
  return { price, currency };
};

const recordVerifiedAdminPrice = async (externalId, publication) => {
  const price = Number(publication?.price);
  const currency = String(publication?.currency || '').trim().toUpperCase();
  const exchangeRate = Number(publication?.exchangeRate) > 0 ? Number(publication.exchangeRate) : 17.49;
  if (!(price > 0) || !['USD', 'MXN'].includes(currency)) return;

  await ensurePriceRegistrySchema();
  await query(`
    WITH listing AS (
      SELECT s.code AS store_code, sl.woo_product_id, sl.external_id, sl.woo_sku,
             current.raw_price, current.raw_currency, current.exchange_rate,
             current.evidence
      FROM store_listings sl
      JOIN stores s ON s.id = sl.store_id
      LEFT JOIN product_price_registry current
        ON current.store_code = s.code AND current.woo_product_id = sl.woo_product_id
      WHERE sl.external_id = $1 AND sl.woo_product_id IS NOT NULL
    ), upserted AS (
      INSERT INTO product_price_registry (
        store_code, woo_product_id, external_id, sku, raw_price, raw_currency,
        exchange_rate, final_price, final_currency, decision_source, verified, evidence
      )
      SELECT store_code, woo_product_id, external_id, woo_sku,
             COALESCE(raw_price, $2), COALESCE(raw_currency, $3),
             COALESCE(exchange_rate, $4), $2, $3,
             'admin-woo-publication', TRUE,
             COALESCE(evidence, '{}'::JSONB) || $5::JSONB
      FROM listing
      ON CONFLICT (store_code, woo_product_id) DO UPDATE SET
        external_id = EXCLUDED.external_id,
        sku = EXCLUDED.sku,
        raw_price = EXCLUDED.raw_price,
        raw_currency = EXCLUDED.raw_currency,
        exchange_rate = EXCLUDED.exchange_rate,
        final_price = EXCLUDED.final_price,
        final_currency = EXCLUDED.final_currency,
        decision_source = EXCLUDED.decision_source,
        verified = TRUE,
        evidence = EXCLUDED.evidence,
        updated_at = NOW()
      RETURNING *
    )
    INSERT INTO product_price_history (
      registry_id, raw_price, raw_currency, exchange_rate, final_price,
      final_currency, decision_source, verified, evidence
    )
    SELECT id, raw_price, raw_currency, exchange_rate, final_price,
           final_currency, decision_source, verified, evidence
    FROM upserted
  `, [externalId, price, currency, exchangeRate, JSON.stringify({ publication })]);
};

// Commit the customer-facing price to Railway before calling CJ or
// WooCommerce. The existing raw amount/currency remains the immutable origin;
// only the calculated final price and publication evidence are advanced.
export const stageRailwayPricePublication = async (externalId, proposal, destination = 'woocommerce') => {
  const price = Number(proposal?.price);
  const currency = String(proposal?.currency || '').trim().toUpperCase();
  if (!(price > 0) || !['USD', 'MXN'].includes(currency)) {
    throw new Error('A positive Railway price and a supported currency are required.');
  }

  await ensurePriceRegistrySchema();
  await withTransaction(async (client) => {
    const listing = await client.query(`
      UPDATE store_listings sl
      SET regular_price = $2,
          sale_price = $2,
          currency_code = $3,
          metadata = sl.metadata || jsonb_build_object(
            'railwayPricePublication', jsonb_build_object(
              'state', 'committed_before_remote',
              'destination', $4::TEXT,
              'proposalSavedAt', $5::TEXT,
              'at', NOW()
            )
          ),
          updated_at = NOW()
      WHERE sl.external_id = $1 AND sl.active = TRUE
      RETURNING sl.store_id, sl.woo_product_id, sl.external_id, sl.woo_sku
    `, [externalId, price, currency, destination, proposal.savedAt || null]);
    if (!listing.rowCount || listing.rows[0].woo_product_id === null) {
      throw new Error('The Railway listing could not be prepared for publication.');
    }

    const row = listing.rows[0];
    await client.query(`
      WITH store AS (
        SELECT code FROM stores WHERE id = $1
      ), upserted AS (
        INSERT INTO product_price_registry (
          store_code, woo_product_id, external_id, sku, raw_price, raw_currency,
          exchange_rate, final_price, final_currency, decision_source, verified, evidence
        )
        SELECT store.code, $2, $3, $4,
               COALESCE(current.raw_price, $5), COALESCE(current.raw_currency, $6),
               COALESCE(current.exchange_rate, 17.49), $5, $6,
               'railway-before-' || $7, COALESCE(current.verified, TRUE),
               COALESCE(current.evidence, '{}'::JSONB) || jsonb_build_object(
                 'railwayCommittedAt', NOW(), 'destination', $7::TEXT,
                 'proposalSavedAt', $8::TEXT
               )
        FROM store
        LEFT JOIN product_price_registry current
          ON current.store_code = store.code AND current.woo_product_id = $2
        ON CONFLICT (store_code, woo_product_id) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          sku = EXCLUDED.sku,
          final_price = EXCLUDED.final_price,
          final_currency = EXCLUDED.final_currency,
          decision_source = EXCLUDED.decision_source,
          evidence = EXCLUDED.evidence,
          updated_at = NOW()
        RETURNING *
      )
      INSERT INTO product_price_history (
        registry_id, raw_price, raw_currency, exchange_rate, final_price,
        final_currency, decision_source, verified, evidence
      )
      SELECT id, raw_price, raw_currency, exchange_rate, final_price,
             final_currency, decision_source, verified, evidence
      FROM upserted
    `, [row.store_id, row.woo_product_id, row.external_id, row.woo_sku, price, currency, destination, proposal.savedAt || null]);
  });
};

export async function finishCjPublication(externalId, operation, publication) {
  const confirmed = confirmedWooPublication(publication);
  await query(`UPDATE store_listings
    SET metadata = jsonb_set(metadata, '{cjPricePublication}', $3::jsonb),
        regular_price = COALESCE($4::NUMERIC, regular_price),
        sale_price = COALESCE($4::NUMERIC, sale_price),
        currency_code = COALESCE($5::TEXT, currency_code),
        updated_at = NOW()
    WHERE external_id = $1 AND metadata->'cjPricePublication'->>'operation' = $2`,
  [externalId, operation, JSON.stringify({ ...publication, operation }), confirmed.price, confirmed.currency]);
  if (confirmed.price !== null) await recordVerifiedAdminPrice(externalId, publication);
}

export async function beginWooPricePublication(externalId, savedAt) {
  const result = await query(`
    UPDATE store_listings SET metadata = jsonb_set(metadata, '{wooPricePublication}',
      jsonb_build_object('state', 'sending', 'operation', gen_random_uuid()::text, 'at', NOW(), 'proposalSavedAt', $2::text))
    WHERE external_id = $1 AND active = TRUE
      AND metadata->'cjPriceProposal'->>'savedAt' = $2
      AND NOT (COALESCE(metadata->'wooPricePublication'->>'state', '') = 'woo_verified'
        AND COALESCE(metadata->'wooPricePublication'->>'proposalSavedAt', '') = $2)
      AND NOT (COALESCE(metadata->'wooPricePublication'->>'state', '') IN ('sending', 'unknown')
        AND COALESCE((metadata->'wooPricePublication'->>'at')::timestamptz, '-infinity'::timestamptz) > NOW() - INTERVAL '2 minutes')
    RETURNING metadata->'wooPricePublication'->>'operation' AS operation
  `, [externalId, savedAt]);
  return result.rows[0]?.operation || null;
}

export async function finishWooPricePublication(externalId, operation, publication) {
  const confirmed = confirmedWooPublication(publication);
  await query(`UPDATE store_listings
    SET metadata = jsonb_set(metadata, '{wooPricePublication}', $3::jsonb),
        regular_price = COALESCE($4::NUMERIC, regular_price),
        sale_price = COALESCE($4::NUMERIC, sale_price),
        currency_code = COALESCE($5::TEXT, currency_code),
        updated_at = NOW()
    WHERE external_id = $1 AND metadata->'wooPricePublication'->>'operation' = $2`,
  [externalId, operation, JSON.stringify({ ...publication, operation }), confirmed.price, confirmed.currency]);
  if (confirmed.price !== null) await recordVerifiedAdminPrice(externalId, publication);
}
