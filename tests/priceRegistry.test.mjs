import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPriceRegistry,
  finalPriceFor,
  mergeRegisteredPriceIntoImport,
  registryFromProduct,
} from '../lib/priceRegistry.mjs';

test('Railway converts an explicitly USD product to its final MXN amount', () => {
  assert.equal(finalPriceFor(11.57, 'USD', 'MXN', 17.49), 202.36);
});

test('Railway leaves an explicitly MXN product unchanged', () => {
  assert.equal(finalPriceFor(700, 'MXN', 'MXN', 17.49), 700);
});

test('a verified per-product Railway currency survives a later Woo import', () => {
  const existing = applyPriceRegistry({}, {
    rawPrice: 11.57,
    rawCurrency: 'USD',
    exchangeRate: 17.49,
    finalPrice: 202.36,
    finalCurrency: 'MXN',
    decisionSource: 'manual-product-review',
    verified: true,
  });
  const merged = mergeRegisteredPriceIntoImport({
    sourcePrice: 12,
    salePrice: 12,
    saleCurrency: 'MXN',
  }, existing);

  assert.equal(merged.sourcePrice, 12);
  assert.equal(merged.sourceCurrency, 'USD');
  assert.equal(merged.salePrice, 209.88);
  assert.equal(merged.saleCurrency, 'MXN');
});

test('registry keeps separate origin and final values for dashboard display', () => {
  const registry = registryFromProduct({
    sourcePrice: 48.96,
    sourceCurrency: 'USD',
    salePrice: 856.31,
    saleCurrency: 'MXN',
    exchangeRate: 17.49,
    sourceManagedByAdmin: true,
  });

  assert.deepEqual(registry, {
    rawPrice: 48.96,
    rawCurrency: 'USD',
    exchangeRate: 17.49,
    finalPrice: 856.31,
    finalCurrency: 'MXN',
    decisionSource: 'admin-woo-publication',
    verified: true,
    evidence: { importedCurrency: null, priceImportRule: null },
  });
});
