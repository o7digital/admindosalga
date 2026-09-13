import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWooPrice } from '../lib/wooPricing.mjs';

const watch = { id: 'wp-dosalga-mexico-12711', saleCurrency: 'MXN', salePrice: 23.58, exchangeRate: 17.49, cjPriceProposal: { price: 300 } };

test('MX source USD converts once, preserving the manually entered proposal', () => {
  const converted = normalizeWooPrice(watch);
  assert.equal(converted.salePrice, 412.41);
  assert.equal(converted.sourceSalePriceUsd, 23.58);
  assert.deepEqual(normalizeWooPrice(converted), converted);
  assert.equal(converted.cjPriceProposal.price, 300);
});

test('manual prices, explicitly normalized prices and US listings retain their amounts', () => {
  for (const product of [
    { ...watch, id: 'manual' },
    { ...watch, priceNormalization: 'local-currency' },
    { ...watch, id: 'wp-dosalga-usa-1', saleCurrency: 'USD' },
  ]) assert.equal(normalizeWooPrice(product).salePrice, 23.58);
});

test('other MX prices stay in pesos; old global conversions are restored exactly once', () => {
  const swimsuit = { ...watch, id: 'wp-dosalga-mexico-20000', salePrice: 645.70 };
  assert.equal(normalizeWooPrice(swimsuit).salePrice, 645.70);
  const old = { ...swimsuit, salePrice: 11293.29, sourceSalePriceUsd: 645.70, priceNormalization: 'woo-mx-usd-v1' };
  const fixed = normalizeWooPrice(old);
  assert.equal(fixed.salePrice, 645.70);
  assert.deepEqual(normalizeWooPrice(fixed), fixed);
  assert.equal(normalizeWooPrice({ ...swimsuit, salePrice: 23.58 }).salePrice, 23.58);
  const oldWatch = { ...watch, salePrice: 412.41, sourceSalePriceUsd: 23.58, priceNormalization: 'woo-mx-usd-v1' };
  assert.equal(normalizeWooPrice(oldWatch).salePrice, 412.41);
});
