import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCjPrice, validateCjPriceProposal } from '../lib/cjPricing.mjs';
import { calculateProductMargin } from '../lib/margins.js';

const product = { cjCostUsd: 10, shippingUsd: 3, saleCurrency: 'USD', exchangeRate: 20 };
const draft = { price: 20, currency: 'USD', shippingIncluded: true, minDeliveryDays: 7, maxDeliveryDays: 14 };

test('suggestions cover included freight and 35% margin in USD and MXN', () => {
  assert.equal(suggestCjPrice(product, true), 20);
  assert.equal(suggestCjPrice({ ...product, saleCurrency: 'MXN' }, true), 400);
  assert.equal(suggestCjPrice(product, false), 15.39);
});

test('fees and taxes are included and rounding never lowers the target margin', () => {
  const withFees = { ...product, platformFeeRate: 0.03, taxRate: 0.16, shippingIncluded: true };
  const price = suggestCjPrice(withFees, true);
  assert.equal(price, 28.27);
  assert.ok(calculateProductMargin({ ...withFees, salePrice: price }).marginRate >= 0.35);
});

test('unknown costs and impossible margins do not produce misleading suggestions', () => {
  for (const cost of [undefined, 0, -1, 'invalid']) assert.equal(suggestCjPrice({ ...product, cjCostUsd: cost }, true), null);
  assert.equal(suggestCjPrice({ ...product, shippingUsd: 0 }, true), null);
  assert.equal(suggestCjPrice({ ...product, shippingUsd: 0 }, false), 15.39);
  assert.equal(suggestCjPrice({ ...product, taxRate: 0.7 }, true), null);
});

test('validated proposals have server-owned status and timestamp, with explicit shipping', () => {
  const result = validateCjPriceProposal({ ...draft, shippingIncluded: false, status: 'published', savedAt: 'fake' });
  assert.equal(result.status, 'draft');
  assert.equal(result.shippingIncluded, false);
  assert.ok(Number.isFinite(Date.parse(result.savedAt)));
  assert.equal(validateCjPriceProposal({ ...draft, currency: 'MXN', price: 400 }).currency, 'MXN');
});

test('invalid price, currency, shipping and ETA are rejected', () => {
  for (const price of [0, 0.001, -1, NaN, Infinity, '', null, true, '20', 100000000]) {
    assert.throws(() => validateCjPriceProposal({ ...draft, price }));
  }
  for (const shippingIncluded of [undefined, null, 'false', 1]) {
    assert.throws(() => validateCjPriceProposal({ ...draft, shippingIncluded }));
  }
  for (const [minDeliveryDays, maxDeliveryDays] of [[0, 7], [14, 7], [1.5, 7], [7, 366], [null, 7], [7, '14']]) {
    assert.throws(() => validateCjPriceProposal({ ...draft, minDeliveryDays, maxDeliveryDays }));
  }
  assert.throws(() => validateCjPriceProposal({ ...draft, currency: 'EUR' }));
});
