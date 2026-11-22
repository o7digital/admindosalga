import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCatalogSource } from '../lib/catalogSyncRunner.mjs';

function setup(overrides = {}) {
  const calls = { pages: [], checkpoints: [], finishes: [] };
  return { calls, options: {
    source: 'woocommerce-us', start: async () => 1,
    fetchPage: async page => { calls.pages.push(page); return { products: [page], hasMore: page < 15 }; },
    savePage: async () => ({ importedCount: 1, updatedCount: 2 }),
    checkpoint: async (source, page) => calls.checkpoints.push(page),
    finish: async (...args) => calls.finishes.push(args),
    ...overrides,
  } };
}

test('automatic scans exhaust every page without the former ten-page cap', async () => {
  const { calls, options } = setup();
  const result = await syncCatalogSource(options);
  assert.equal(result.status, 'complete');
  assert.equal(result.importedCount, 15);
  assert.equal(result.updatedCount, 30);
  assert.equal(calls.pages.at(-1), 15);
  assert.equal(calls.finishes[0][1], 'complete');
});

test('a time-limited scan checkpoints the next page and resumes without pretending completion', async () => {
  let time = 0;
  const first = setup({ now: () => time += 1000, budgetMs: 500 });
  const result = await syncCatalogSource(first.options);
  assert.equal(result.status, 'partial');
  assert.equal(result.nextPage, 2);
  assert.deepEqual(first.calls.checkpoints, [2]);
  const second = setup({ start: async () => result.nextPage, fetchPage: async page => ({ products: [page], hasMore: false }) });
  assert.equal((await syncCatalogSource(second.options)).status, 'complete');
});

test('a failed page is retried, and disabled CJ access is explicitly blocked', async () => {
  for (const [message, status] of [['WooCommerce timeout', 'failed'], ['Your API access has been disabled. Please reactivate it.', 'blocked']]) {
    const { calls, options } = setup({ fetchPage: async () => { throw new Error(message); } });
    const result = await syncCatalogSource(options);
    assert.equal(result.status, status);
    assert.equal(result.message, message);
    assert.deepEqual(calls.checkpoints, []);
    assert.equal(calls.finishes[0][1], status);
  }
});
