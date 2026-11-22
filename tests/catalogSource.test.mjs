import './helpers/module-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cronAuthorized, pendingCjProduct, sourceSnapshot, sourceChanges, wooRestAsStoreProduct } from '../lib/catalogSource.mjs';
const { mapWooProduct, storeSources } = await import('../services/wordpressStores.js');

test('CJ My Products stages separate MX and US drafts without inventing sale prices, stock or shipping', () => {
  const raw = { productId: 'cj-shoe-1', sku: 'CJ-SHOE', nameEn: 'Shoe', sellPrice: '5.07', trialFreight: '0' };
  const mx = pendingCjProduct(raw, 'MX');
  const us = pendingCjProduct(raw, 'US');
  assert.notEqual(mx.id, us.id);
  assert.equal(mx.saleCurrency, 'MXN');
  assert.equal(us.saleCurrency, 'USD');
  for (const product of [mx, us]) {
    assert.equal(product.salePrice, 0);
    assert.equal(product.cjCostUsd, 0, 'a catalogue preview is not a verified variant cost');
    assert.equal(product.cjCatalogCostUsd, 5.07);
    assert.equal(product.shippingIncluded, null);
    assert.equal(product.stock, 0);
    assert.equal(product.wooPricePublication, undefined);
    assert.equal(product.status, 'review');
    assert.equal(product.catalogIntake.needsWooListing, true);
  }
  assert.throws(() => pendingCjProduct({ ...raw, sku: '' }, 'MX'), /identity/);
});

test('authenticated REST imports retain major currency units for both native CAPS and general products', () => {
  for (const market of ['MX', 'US']) {
    const source = storeSources.find(s => s.id === (market === 'MX' ? 'dosalga-mexico' : 'dosalga-usa'));
    for (const native of [false, true]) {
      const raw = { id: 123, sku: 'SHOE', name: 'Shoe', price: '650.00', regular_price: '650.00',
        stock_status: 'instock', categories: [{ name: 'Caps', slug: 'caps' }] };
      const rules = native ? [{ storeCode: market, categorySlug: 'caps', priceMode: 'native',
        sourceCurrency: source.currency, displayCurrency: source.currency, exchangeRate: 1 }] : [];
      const mapped = mapWooProduct(wooRestAsStoreProduct(raw, source.currency), source, rules);
      assert.equal(mapped.salePrice, 650);
      assert.equal(mapped.saleCurrency, source.currency);
    }
  }
});

test('source revisions ignore receipt time; updates identify fields and do not treat the admin price echo as an external change', () => {
  const product = { name: 'Shoe', sku: 'CJ1', salePrice: 650, saleCurrency: 'MXN' };
  const original = sourceSnapshot(product, 'woocommerce-mx', { status: 'publish', stock_quantity: 10 });
  assert.equal(original.revision, sourceSnapshot({ ...product, updatedAt: 'later' }, 'woocommerce-mx', { status: 'publish', stock_quantity: 10 }).revision);
  const next = sourceSnapshot({ ...product, salePrice: 700, name: 'New shoe' }, 'woocommerce-mx', { status: 'publish', stock_quantity: 9 });
  assert.deepEqual(sourceChanges(original, next, { sale_price: '700', currency_code: 'MXN' }), ['name', 'stock']);
  assert.deepEqual(sourceChanges(original, next, { sale_price: '650', currency_code: 'MXN' }), ['name', 'price', 'stock']);
  assert.deepEqual(sourceChanges(null, next, {}), [], 'bootstrap establishes a baseline without invalidating existing approvals');
});

test('cron authentication rejects absent configuration, malformed credentials and wrong tokens', () => {
  assert.equal(cronAuthorized('Bearer correct', 'correct'), true);
  for (const header of [undefined, '', 'correct', 'Bearer wrong', 'Bearer correct-extra']) assert.equal(cronAuthorized(header, 'correct'), false);
  assert.equal(cronAuthorized('Bearer undefined', undefined), false);
  assert.equal(cronAuthorized('Bearer ', ''), false);
});
