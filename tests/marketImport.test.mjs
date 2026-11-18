import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingUsProduct, isPendingUsImport } from '../lib/marketImport.mjs';

test('US imports retain identity but discard MX price approvals and destination quotes', () => {
  const source = { id: 'source-uuid', woo_sku: 'CJ123', woo_product_id: '45', sale_price: '1400', canonical_name: 'Bag', metadata: {
    pid: 'cj-pid', cjCostUsd: 7, wooPricePublication: { state: 'woo_verified' },
    cjPriceProposal: { price: 1400, currency: 'MXN' }, variantFreight: { destination: 'México' },
    shippingIncluded: true, shippingUsd: 15, minDeliveryDays: 7, maxDeliveryDays: 14,
  } };
  const result = pendingUsProduct(source, '2026-11-18T00:00:00Z');
  assert.equal(result.sku, 'CJ123');
  assert.equal(result.pid, 'cj-pid');
  assert.equal(result.salePrice, 0);
  assert.equal(result.saleCurrency, 'USD');
  assert.equal(result.shippingIncluded, null);
  assert.equal(result.shippingUsd, 0);
  assert.equal(result.maxDeliveryDays, 0);
  assert.equal(result.shippingDestination, 'USA');
  assert.equal(result.wooPricePublication, undefined);
  assert.equal(result.cjPriceProposal, undefined);
  assert.equal(result.variantFreight, undefined);
  assert.equal(result.productUrl, '');
  assert.equal(result.marketImport.sourcePrice, 1400);
  assert.equal(result.marketImport.sourceCurrency, 'MXN');
  assert.equal(isPendingUsImport(result), true);
});

test('source block remains recorded for review and missing SKUs are rejected', () => {
  assert.throws(() => pendingUsProduct({}), /SKU/);
  assert.equal(pendingUsProduct({ id: '1', woo_sku: 'CJ1', metadata: { wooFrozen: true } }).marketImport.sourceBlocked, true);
});
