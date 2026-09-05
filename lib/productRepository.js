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
      metadata = EXCLUDED.metadata
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
      `, [mappingId, numeric(product.cjCostUsd), product.cjCostCurrency || 'USD', numeric(product.stock), product.lastCjSyncAt || null]);
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
    shipping_cost: numeric(product.shippingUsd),
    shipping_currency: product.shippingCurrency || 'USD',
    destination_country: storeCode,
    shipping_method: product.transportMethod || null,
    min_days: numeric(product.minDeliveryDays) || null,
    max_days: numeric(product.maxDeliveryDays) || null,
    origin_country: product.shippingOrigin || null,
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
    shipping_cost NUMERIC,
    shipping_currency TEXT,
    destination_country TEXT,
    shipping_method TEXT,
    min_days INTEGER,
    max_days INTEGER,
    origin_country TEXT
  )
`;

export const upsertProducts = async (products) => {
  if (!products.length) return [];
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
        metadata = EXCLUDED.metadata
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
      SELECT mappings.id, staged.cj_cost, staged.cj_cost_currency, staged.stock,
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
      p.updated_at
    FROM store_listings sl
    JOIN stores s ON s.id = sl.store_id
    JOIN products p ON p.id = sl.product_id
    ORDER BY p.updated_at DESC, p.canonical_name
  `);

  return result.rows.map((row) => ({
    ...(row.metadata || {}),
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
  }));
};

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
