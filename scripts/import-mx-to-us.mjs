import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { pendingUsProduct } from '../lib/marketImport.mjs';

const apply = process.argv.includes('--apply');
const backupPath = process.argv.find(arg => arg.startsWith('--backup='))?.slice('--backup='.length);
const connectionString = process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_NON_POOLING or DATABASE_URL is required.');
if (apply && !backupPath) throw new Error('--apply requires --backup=<private JSON path>.');
const client = new pg.Client({ connectionString, ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('dosalga-mx-to-us-import'))");
  const target = (await client.query("SELECT id FROM stores WHERE code = 'US' AND active = TRUE")).rows[0];
  if (!target) throw new Error('The US store is not configured.');
  const source = (await client.query(`
    SELECT l.*, p.canonical_name, p.brand, p.category, p.image_url, p.description,
           c.payload AS catalog_payload
    FROM store_listings l JOIN stores s ON s.id = l.store_id
    JOIN products p ON p.id = l.product_id
    LEFT JOIN storefront_catalog_products c ON c.store_id = 'MX' AND c.woo_id = l.woo_product_id
    WHERE s.code = 'MX' AND l.active = TRUE AND p.status <> 'archived'
      AND l.metadata->'wooPricePublication'->>'state' = 'woo_verified'
      AND NULLIF(l.metadata->'cjPriceProposal'->>'savedAt', '') IS NOT NULL
      AND l.metadata->'wooPricePublication'->>'proposalSavedAt' = l.metadata->'cjPriceProposal'->>'savedAt'
    ORDER BY l.woo_product_id
    FOR SHARE OF l, p
  `)).rows;
  if (!source.length) throw new Error('There are no current green MX products to import.');
  const targetRows = (await client.query('SELECT * FROM store_listings WHERE store_id = $1 FOR UPDATE', [target.id])).rows;
  const bySku = new Map();
  for (const row of targetRows) {
    const key = String(row.woo_sku || '').trim().toLowerCase();
    if (!key) continue;
    if (bySku.has(key)) throw new Error(`Duplicate US SKU: ${row.woo_sku}`);
    bySku.set(key, row);
  }
  const sourceSkus = new Set();
  for (const row of source) {
    const key = String(row.woo_sku || '').trim().toLowerCase();
    if (!key || sourceSkus.has(key)) throw new Error(`Missing or duplicate source SKU: ${row.woo_sku}`);
    sourceSkus.add(key);
    if (row.currency_code.trim() !== 'MXN') throw new Error(`Unexpected MX currency for ${row.woo_sku}`);
    if (!row.catalog_payload && row.metadata.wooFrozen !== true) throw new Error(`Missing MX catalogue payload for ${row.woo_sku}`);
  }
  const existingImports = (await client.query("SELECT * FROM storefront_catalog_imports WHERE target_store = 'US'")).rows;
  const summary = { sourceProducts: source.length, existingUsProducts: 0, newPendingProducts: 0, alreadyPendingProducts: 0, blockedAtSource: 0 };
  if (apply) {
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), source, targetRows, existingImports }), { mode: 0o600, flag: 'wx' });
  }
  for (const row of source) {
    const sku = row.woo_sku.trim();
    let destination = bySku.get(sku.toLowerCase());
    const imported = pendingUsProduct(row);
    if (destination?.woo_product_id) summary.existingUsProducts++;
    else if (destination) summary.alreadyPendingProducts++;
    else {
      summary.newPendingProducts++;
      if (apply) {
        destination = (await client.query(`
          INSERT INTO store_listings (external_id, store_id, product_id, woo_sku,
            sale_price, currency_code, shipping_included, woo_stock_quantity, active, metadata)
          VALUES ($1, $2, $3, $4, 0, 'USD', NULL, 0, TRUE, $5::jsonb) RETURNING *
        `, [imported.id, target.id, row.product_id, sku, JSON.stringify(imported)])).rows[0];
        bySku.set(sku.toLowerCase(), destination);
      }
    }
    if (row.metadata.wooFrozen === true) summary.blockedAtSource++;
    if (!apply) continue;
    const payload = row.catalog_payload || {
      id: Number(row.woo_product_id), sku, name: row.canonical_name,
      description: row.description || '', images: imported.imageUrl ? [{ src: imported.imageUrl }] : [],
      status: 'draft', source_catalog_unavailable: true,
    };
    const state = destination.woo_product_id ? 'existing_us' : row.metadata.wooFrozen === true ? 'source_blocked' : 'pending_us_review';
    await client.query(`
      INSERT INTO storefront_catalog_imports (source_store, target_store, source_listing_id,
        target_listing_id, sku, source_woo_product_id, target_woo_product_id,
        source_price, source_currency, target_currency, review_state,
        source_catalog_available, source_payload, source_admin_metadata)
      VALUES ('MX', 'US', $1, $2, $3, $4, $5, $6, 'MXN', 'USD', $7, $8, $9::jsonb, $10::jsonb)
      ON CONFLICT (target_store, source_listing_id) DO UPDATE SET
        source_price = EXCLUDED.source_price, source_payload = EXCLUDED.source_payload,
        source_admin_metadata = EXCLUDED.source_admin_metadata,
        source_catalog_available = EXCLUDED.source_catalog_available, updated_at = NOW()
    `, [row.id, destination.id, sku, row.woo_product_id, destination.woo_product_id,
      row.sale_price, state, Boolean(row.catalog_payload), JSON.stringify(payload), JSON.stringify(row.metadata)]);
  }
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', ...summary }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
