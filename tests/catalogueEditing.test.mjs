import test from 'node:test';
import assert from 'node:assert/strict';
import { retainCatalogueRows, createCatalogueReadGuard } from '../lib/catalogueEditing.mjs';
import { compareCataloguePriority } from '../lib/productAlerts.mjs';

test('publication and refresh preserve the working list even after the edited row leaves the review filter', () => {
  const reviewed = { id: 'edited', saleCurrency: 'MXN', salePrice: 350, status: 'approved' };
  const urgent = { id: 'other', saleCurrency: 'MXN', salePrice: 0, status: 'review' };
  const products = [urgent, reviewed];
  const matching = products.filter(product => product.status === 'review').sort(compareCataloguePriority);
  const rows = retainCatalogueRows(products, matching, ['edited', 'other']);
  assert.deepEqual(rows.map(product => product.id), ['edited', 'other']);
  assert.equal(rows[0].salePrice, 350);
  assert.deepEqual(retainCatalogueRows(products, matching).map(product => product.id), ['other']);
});

test('new matches are appended once while removed or archived listings are never retained', () => {
  const products = [{ id: 'a' }, { id: 'b', archived: true }, { id: 'c', status: 'archived' }, { id: 'new' }];
  assert.deepEqual(retainCatalogueRows(products, [products[0], products[3]], ['a', 'b', 'c', 'missing'])
    .map(product => product.id), ['a', 'new']);
});

test('a catalogue response started before a save cannot overwrite the updated price or draft', async () => {
  const guard = createCatalogueReadGuard();
  let finishRead;
  let displayed = [{ id: 'a', salePrice: 100 }];
  const pending = guard.read(() => new Promise(resolve => { finishRead = resolve; }), rows => { displayed = rows; });
  guard.changed();
  displayed = [{ id: 'a', salePrice: 350, cjPriceProposal: { price: 350 } }];
  finishRead([{ id: 'a', salePrice: 100 }]);
  await pending;
  assert.equal(displayed[0].salePrice, 350);
  assert.equal(displayed[0].cjPriceProposal.price, 350);
  await guard.read(async () => [{ id: 'a', salePrice: 350, stock: 15 }], rows => { displayed = rows; });
  assert.equal(displayed[0].stock, 15);
});
