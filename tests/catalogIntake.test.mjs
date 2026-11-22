import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeMexicanCatalog } from '../lib/catalogIntake.mjs';

test('new WooCommerce arrivals enter review without assumed delivery terms or a publication', async () => {
  let saved;
  const result = await intakeMexicanCatalog({
    query: async () => ({ rows: [{ payload: { id: 42608, sku: 'CJNS2916672' } }] }),
    mapProduct: payload => ({
      id: `wp-dosalga-mexico-${payload.id}`, sku: payload.sku,
      sourceCurrency: 'USD', sourcePrice: 12, saleCurrency: 'MXN', salePrice: 210,
      status: 'approved', shippingIncluded: true, minDeliveryDays: 7, maxDeliveryDays: 14,
    }),
    saveProducts: async (products, options) => {
      assert.deepEqual(options, { onlyMissing: true });
      saved = products;
      return products;
    },
  });
  assert.equal(result.importedCount, 1);
  assert.equal(saved[0].status, 'review');
  assert.equal(saved[0].shippingIncluded, null);
  assert.equal(saved[0].minDeliveryDays, 0);
  assert.equal(saved[0].maxDeliveryDays, 0);
  assert.equal(saved[0].sourceCurrency, 'USD');
  assert.equal(saved[0].salePrice, 210);
  assert.equal(saved[0].wooPricePublication, undefined);
  assert.equal(saved[0].cjPriceProposal, undefined);
});

test('empty or unavailable snapshots leave existing approvals untouched', async () => {
  for (const available of [true, false]) {
    const result = await intakeMexicanCatalog({
      query: async () => {
        if (!available) throw Object.assign(new Error('missing snapshot'), { code: '42P01' });
        return { rows: [] };
      },
      mapProduct: () => assert.fail('no products should be mapped'),
      saveProducts: () => assert.fail('no existing listing should be written'),
    });
    assert.equal(result.importedCount, 0);
    assert.equal(result.snapshotAvailable, available);
  }
});

test('concurrent intake reports only rows actually inserted and surfaces database failures', async () => {
  const result = await intakeMexicanCatalog({
    query: async () => ({ rows: [{ payload: { id: 1 } }] }),
    mapProduct: product => product,
    saveProducts: async () => [],
  });
  assert.equal(result.importedCount, 0);
  await assert.rejects(intakeMexicanCatalog({
    query: async () => { throw new Error('connection lost'); },
  }), /connection lost/);
});
