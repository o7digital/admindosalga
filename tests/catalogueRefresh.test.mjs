import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogueRefresher } from '../lib/catalogueRefresh.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('products are available while a slow import is pending; concurrent refresh events share the import', async () => {
  const importing = deferred();
  const calls = [];
  const refresh = createCatalogueRefresher({
    loadProducts: async () => { calls.push('products'); },
    importProducts: () => { calls.push('import'); return importing.promise; },
    loadStatus: async () => { calls.push('status'); },
  });
  const first = refresh();
  assert.equal(refresh(), first);
  await Promise.resolve();
  assert.deepEqual(calls, ['products', 'import']);
  importing.resolve({ importedCount: 0 });
  await first;
  assert.deepEqual(calls, ['products', 'import', 'status']);
  await refresh();
  assert.deepEqual(calls, ['products', 'import', 'status', 'products', 'import', 'status']);
});

test('new arrivals trigger a second read after the initial display', async () => {
  const calls = [];
  await createCatalogueRefresher({
    loadProducts: async () => { calls.push('products'); },
    importProducts: async () => { calls.push('import'); return { importedCount: 3 }; },
    loadStatus: async () => { calls.push('status'); },
  })();
  assert.deepEqual(calls, ['products', 'import', 'products', 'status']);
});

test('failed imports do not discard displayed products and can be retried', async () => {
  let reads = 0, imports = 0;
  const refresh = createCatalogueRefresher({
    loadProducts: async () => { reads++; },
    importProducts: async () => { if (++imports === 1) throw new Error('Import unavailable'); return { importedCount: 0 }; },
    loadStatus: async () => {},
  });
  await assert.rejects(refresh(), /Import unavailable/);
  assert.equal(reads, 1);
  await refresh();
  assert.equal(reads, 2);
  assert.equal(imports, 2);
});
