import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCjCostUpdate,
  mergeCjDataIntoWordPressProduct,
  overlayCjSnapshot,
  parseCjPrice,
} from '../lib/cjData.mjs';

test('parseCjPrice accepts scalar and range prices', () => {
  assert.equal(parseCjPrice(6.62), 6.62);
  assert.equal(parseCjPrice('6.62-7.10'), 6.62);
  assert.equal(parseCjPrice('$6.62 – $7.10'), 6.62);
  assert.equal(parseCjPrice('6,62'), 6.62);
  assert.equal(parseCjPrice('not available'), 0);
  assert.equal(parseCjPrice(0), 0);
});

test('cost-only CJ update preserves every WooCommerce sale field and stock', () => {
  const source = {
    id: 'wp-dosalga-mexico-11702',
    sku: 'CJEJ1477239',
    stock: 25,
    salePrice: 650,
    saleCurrency: 'MXN',
    sourcePrice: 650,
    sourceCurrency: 'MXN',
    cjCostUsd: 0,
  };
  const update = applyCjCostUpdate(source, {
    pid: '1522415642064990208',
    cjSku: 'CJEJ1477239',
    cjCost: 6.62,
    stock: 0,
  }, '2026-09-22T01:00:00.000Z');

  assert.equal(update.product.cjCostUsd, 6.62);
  assert.equal(update.product.cjCostCurrency, 'USD');
  assert.equal(update.product.cjOriginalCostUsd, 6.62);
  assert.equal(update.product.cjOriginalCostCurrency, 'USD');
  assert.equal(update.product.cjOriginalCostAt, '2026-09-22T01:00:00.000Z');
  assert.equal(update.product.stock, 25);
  assert.equal(update.product.cjStock, 0);
  assert.equal(update.product.salePrice, 650);
  assert.equal(update.product.saleCurrency, 'MXN');
  assert.equal(update.product.sourcePrice, 650);
  assert.equal(update.product.sourceCurrency, 'MXN');
});

test('invalid CJ cost cannot overwrite a known positive cost', () => {
  const source = { sku: 'CJEJ1477239', cjCost: 6.62, cjCostUsd: 6.62 };
  assert.throws(
    () => applyCjCostUpdate(source, { cjCost: 0 }),
    /no valid positive USD cost/,
  );
  assert.equal(source.cjCostUsd, 6.62);
});

test('WordPress import keeps CJ data but owns sale price and source currency', () => {
  const incoming = {
    id: 'wp-dosalga-mexico-11702',
    sku: 'CJEJ1477239',
    stock: 25,
    salePrice: 650,
    saleCurrency: 'MXN',
    sourcePrice: 650,
    sourceCurrency: 'MXN',
    cjCost: 0,
    cjCostUsd: 0,
    lastCjSyncAt: null,
  };
  const existing = {
    ...incoming,
    pid: '1522415642064990208',
    supplier: 'CJdropshipping',
    cjCost: 6.62,
    cjCostUsd: 6.62,
    cjCostCurrency: 'USD',
    cjStock: 0,
    lastCjSyncAt: '2026-09-22T01:00:00.000Z',
    salePrice: 37.16,
    saleCurrency: 'USD',
    sourcePrice: 37.16,
    sourceCurrency: 'USD',
  };

  const merged = mergeCjDataIntoWordPressProduct(incoming, existing);
  assert.equal(merged.pid, '1522415642064990208');
  assert.equal(merged.cjCostUsd, 6.62);
  assert.equal(merged.cjCostCurrency, 'USD');
  assert.equal(merged.cjStock, 0);
  assert.equal(merged.salePrice, 650);
  assert.equal(merged.saleCurrency, 'MXN');
  assert.equal(merged.sourcePrice, 650);
  assert.equal(merged.sourceCurrency, 'MXN');
  assert.equal(merged.stock, 25);
});

test('latest positive relational snapshot replaces zero JSON cost', () => {
  const product = overlayCjSnapshot(
    { pid: 'CJEJ1477239', cjCost: 0, cjCostUsd: 0, stock: 25 },
    {
      pid: '1522415642064990208',
      sku: 'CJEJ1477239',
      productCost: '6.6200',
      currency: 'USD',
      availableStock: '0',
      capturedAt: '2026-09-22T01:00:00.000Z',
      originalProductCost: '5.9900',
      originalCurrency: 'USD',
      originalCapturedAt: '2026-08-01T01:00:00.000Z',
    },
  );

  assert.equal(product.pid, '1522415642064990208');
  assert.equal(product.cjCostUsd, 6.62);
  assert.equal(product.cjStock, 0);
  assert.equal(product.stock, 25);
  assert.equal(product.lastCjSyncAt, '2026-09-22T01:00:00.000Z');
  assert.equal(product.cjOriginalCostUsd, 5.99);
  assert.equal(product.cjOriginalCostAt, '2026-08-01T01:00:00.000Z');
});
