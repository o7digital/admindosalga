import test from 'node:test';
import assert from 'node:assert/strict';
import { variantFreightSummary } from '../lib/variantFreight.mjs';
import { calculateProductMargin } from '../lib/margins.js';
import { suggestCjPrice } from '../lib/cjPricing.mjs';
import { mergeCjDataIntoWordPressProduct } from '../lib/cjData.mjs';
const product = { salePrice: 15.96, saleCurrency: 'USD', cjCostUsd: 2.47, shippingUsd: 10.86, shippingIncluded: true, variantFreight: { method: 'LuWei', variants: [
  { vid: '39', cjCostUsd: 2.47, routes: [{ method: 'LuWei', shippingCost: 10.86 }] },
  { vid: '44', cjCostUsd: 2.47, routes: [{ method: 'LuWei', shippingCost: 12.16 }] },
] } };
test('shoe variants preserve distinct freight and use the lowest margin', () => {
  const summary = variantFreightSummary(product);
  assert.equal(summary.min, 10.86); assert.equal(summary.max, 12.16); assert.equal(summary.complete, true);
  assert.equal(summary.worst.vid, '44');
  assert.ok(Math.abs(calculateProductMargin(product).profit - 1.33) < 1e-8);
  assert.equal(suggestCjPrice(product, true), 22.51);
});
test('missing selected route is unconfirmed and blocks suggested price', () => {
  const missing = { ...product, variantFreight: { ...product.variantFreight, method: 'Other' } };
  assert.equal(variantFreightSummary(missing).confirmed, 0);
  assert.equal(variantFreightSummary(missing).min, null);
  assert.equal(suggestCjPrice(missing, true), null);
});
test('partial quotes are labelled incomplete; free quotes remain valid', () => {
  const partial = { ...product, variantFreight: { method: 'LuWei', variants: [{ vid: 'a', cjCostUsd: 3, routes: [{ method: 'LuWei', shippingCost: 0 }] }, { vid: 'b', cjCostUsd: 4, routes: [] }] } };
  assert.equal(variantFreightSummary(partial).min, 0);
  assert.equal(calculateProductMargin(partial).variantFreightComplete, false);
  assert.equal(suggestCjPrice(partial, true), null);
});
test('Woo reimport preserves variant freight', () => {
  assert.deepEqual(mergeCjDataIntoWordPressProduct({}, product).variantFreight, product.variantFreight);
});

test('delivery estimates cover every quoted size and missing estimates are not invented', async () => {
  const { freightDeliveryRange } = await import('../lib/variantFreight.mjs');
  const p = { variantFreight: { method: 'CJ', variants: [
    { cjCostUsd: 5, routes: [{ method: 'CJ', shippingCost: 7, minDeliveryDays: 12, maxDeliveryDays: 20 }] },
    { cjCostUsd: 5, routes: [{ method: 'CJ', shippingCost: 5, minDeliveryDays: 14, maxDeliveryDays: 25 }] },
  ] } };
  assert.deepEqual(freightDeliveryRange(p), { min: 12, max: 25 });
  p.variantFreight.variants[1].routes[0].maxDeliveryDays = 0;
  assert.equal(freightDeliveryRange(p), null);
});
test('completed quotes select a method available on every variant', async () => {
  const { commonFreightMethod } = await import('../lib/variantFreight.mjs');
  const freight = { method: 'Only S', variants: [
    { quotedAt: 'now', routes: [{ method: 'Only S', shippingCost: 1 }, { method: 'Common', shippingCost: 7 }, { method: 'Premium', shippingCost: 10 }] },
    { quotedAt: 'now', routes: [{ method: 'Common', shippingCost: 5 }, { method: 'Premium', shippingCost: 12 }] },
  ] };
  assert.equal(commonFreightMethod(freight), 'Common');
  assert.equal(commonFreightMethod({ ...freight, method: 'Premium' }), 'Premium');
});
