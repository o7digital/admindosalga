import './helpers/module-loader.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from 'pg';

const connection = process.env.CATALOG_TEST_DATABASE_URL;
if (!connection) throw new Error('CATALOG_TEST_DATABASE_URL is required; tests use and remove an isolated schema.');
const schema = `catalog_sync_test_${process.pid}_${Date.now()}`;
const url = new URL(connection);
url.searchParams.set('options', `-c search_path=${schema},public`);
process.env.DATABASE_URL = url.toString();
const control = new pg.Client({ connectionString: connection, ssl: { rejectUnauthorized: false } });
await control.connect();
let pool;
try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  await control.query(`SET search_path TO "${schema}", public`);
  await control.query(`CREATE TABLE storefront_catalog_products (store_id TEXT,woo_id BIGINT,sku TEXT,price NUMERIC,payload JSONB,synced_at TIMESTAMPTZ)`);
  const files = (await fs.readdir(new URL('../db/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) await control.query(await fs.readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8'));
  const { db, query } = await import('../lib/db.js');
  pool = db;
  assert.equal((await query('SELECT current_schema() AS schema')).rows[0].schema, schema, 'all test writes must stay in the isolated schema');
  const { upsertProducts, beginWooPricePublication, finishWooPricePublication } = await import('../lib/productRepository.js');
  const { saveCatalogSourceProducts, acquireCatalogSync, releaseCatalogSync } = await import('../lib/catalogSyncRepository.js');
  const { pendingCjProduct, sourceSnapshot } = await import('../lib/catalogSource.mjs');
  const savedAt = '2026-11-21T00:00:00Z';
  const fixture = { id: 'wp-dosalga-mexico-100000001', siteId: 'dosalga-mexico', sku: 'TEST-CJ-SHOE',
    name: 'Shoe', salePrice: 650, sourcePrice: 650, sourceCurrency: 'MXN', saleCurrency: 'MXN',
    stock: 27, status: 'approved', shippingIncluded: true, minDeliveryDays: 7, maxDeliveryDays: 14,
    cjPriceProposal: { savedAt }, wooPricePublication: { state: 'woo_verified', proposalSavedAt: savedAt, price: 650, currency: 'MXN' } };
  const blocked = { ...fixture, id: 'wp-dosalga-mexico-100000003', sku: 'TEST-BLOCKED', archived: true, wooFrozen: true };
  await upsertProducts([fixture, blocked]);
  const source = (product, stock) => ({ ...product, catalogSourceSnapshot: sourceSnapshot(product, 'woocommerce-mx', { stock_quantity: stock, status: 'publish' }) });
  const baseline = [source(fixture, 27), source(blocked, 27)];
  assert.deepEqual(await saveCatalogSourceProducts(baseline, 'woocommerce-mx', 'MX'), { importedCount: 0, updatedCount: 0 });
  const changed = baseline.map(p => source({ ...p, name: 'Changed source shoe', salePrice: 900 }, 26));
  assert.equal((await saveCatalogSourceProducts(changed, 'woocommerce-mx', 'MX')).updatedCount, 2);
  assert.equal((await saveCatalogSourceProducts(changed, 'woocommerce-mx', 'MX')).updatedCount, 0, 'same revision is idempotent');
  const read = async id => (await query('SELECT * FROM store_listings WHERE external_id=$1', [id])).rows[0];
  let row = await read(fixture.id);
  assert.equal(Number(row.sale_price), 650);
  assert.equal(row.currency_code, 'MXN');
  assert.equal(row.shipping_included, true);
  assert.equal(row.metadata.pendingSourceChanges, true);
  assert.deepEqual(row.metadata.wooPricePublication, fixture.wooPricePublication);
  const frozen = await read(blocked.id);
  assert.equal(frozen.active, false);
  assert.equal(frozen.metadata.wooFrozen, true);
  assert.equal(Number(frozen.woo_stock_quantity), 27);
  await upsertProducts([fixture]);
  assert.equal((await read(fixture.id)).metadata.pendingSourceChanges, true, 'manual reimports preserve source review state');
  assert.ok((await read(fixture.id)).metadata.catalogSources['woocommerce-mx']);

  const cj = pendingCjProduct({ productId: 'pid-shoe', sku: fixture.sku, nameEn: 'CJ shoe', sellPrice: '5.07' }, 'US');
  await upsertProducts([cj], { onlyMissing: true });
  const pending = await read(cj.id);
  const freshCj = pendingCjProduct({ productId: 'pid-new-shoe', sku: 'TEST-NEW-CJ', nameEn: 'New CJ shoe', sellPrice: '6.20' }, 'US');
  const cjBatch = [cj, freshCj].map(product => ({ ...product,
    catalogSourceSnapshot: sourceSnapshot(product, 'cj-my-products'),
  }));
  assert.equal((await saveCatalogSourceProducts(cjBatch, 'cj-my-products', 'US')).importedCount, 1,
    'an existing US draft without a Woo ID must not suppress unrelated new CJ products in its batch');
  assert.equal((await read(freshCj.id)).woo_product_id, null);
  assert.equal((await saveCatalogSourceProducts(cjBatch, 'cj-my-products', 'US')).importedCount, 0);
  const us = { ...cj, id: 'wp-dosalga-usa-100000002', productUrl: 'https://wp-dosalga-us.o7digitalgroup.com/?post_type=product&p=100000002',
    catalogSourceSnapshot: sourceSnapshot({ ...cj, salePrice: 40 }, 'woocommerce-us', { stock_quantity: 5, status: 'publish' }) };
  assert.equal((await saveCatalogSourceProducts([us], 'woocommerce-us', 'US')).importedCount, 0);
  const linked = await read(us.id);
  assert.equal(linked.id, pending.id, 'the pending US listing is attached, never duplicated');
  assert.equal(String(linked.woo_product_id), '100000002');
  assert.equal(linked.currency_code, 'USD');
  assert.equal(Number(linked.sale_price), 0, 'no MX price or unvalidated Woo price leaks into US');
  assert.equal(linked.metadata.catalogIntake.needsWooListing, false);
  assert.equal((await query("SELECT count(*) FROM store_listings l JOIN stores s ON s.id=l.store_id WHERE s.code='US' AND l.woo_sku=$1", [fixture.sku])).rows[0].count, '1');

  row = await read(fixture.id);
  const observed = row.metadata.catalogSources;
  let operation = await beginWooPricePublication(fixture.id, savedAt);
  assert.ok(operation, 'an unchanged price can be revalidated after source changes');
  await saveCatalogSourceProducts([source({ ...fixture, name: 'Arrived during validation', salePrice: 950 }, 26)], 'woocommerce-mx', 'MX');
  const publication = { ...fixture.wooPricePublication, shippingIncluded: true, minDeliveryDays: 7, maxDeliveryDays: 14 };
  await finishWooPricePublication(fixture.id, operation, publication, observed);
  assert.equal((await read(fixture.id)).metadata.pendingSourceChanges, true, 'a newly arrived revision cannot be acknowledged by an older review');
  operation = await beginWooPricePublication(fixture.id, savedAt);
  await finishWooPricePublication(fixture.id, operation, publication, (await read(fixture.id)).metadata.catalogSources);
  assert.equal((await read(fixture.id)).metadata.pendingSourceChanges, false);
  const leases = await Promise.all([acquireCatalogSync(), acquireCatalogSync()]);
  assert.equal(leases.filter(Boolean).length, 1);
  await releaseCatalogSync();
  console.log('PostgreSQL catalogue sync passed: market identities, pending linkage, idempotency, protected prices/blocks/archives, import preservation, concurrent review and scheduler locking.');
} finally {
  if (pool) await pool.end();
  await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await control.end();
}
