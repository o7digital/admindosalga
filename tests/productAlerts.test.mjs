import test from 'node:test';
import assert from 'node:assert/strict';
import { productAudit, auditCatalogue, compareProductPriority, compareCataloguePriority, isPublishedCurrent, productRowClass } from '../lib/productAlerts.mjs';
const base = { id: 'hoodie', saleCurrency: 'MXN', salePrice: 34, exchangeRate: 17.49, cjCostUsd: 6, shippingUsd: 2, shippingIncluded: true, stock: 20, pid: 'cj', minDeliveryDays: 7, maxDeliveryDays: 14, lastCjSyncAt: new Date().toISOString() };
test('hoodie 34 MXN vs 6 USD is red and first, without changing its price', () => {
 const healthy = { ...base, id: 'healthy', salePrice: 220 };
 assert.equal(productAudit(base).critical, true);
 assert.equal(productAudit(base).issues[0].code, 'below-cj');
 assert.equal([healthy, base].sort(compareProductPriority)[0].id, 'hoodie');
 assert.equal(base.salePrice, 34);
});
test('compares same currency; includes shipping and handles high price gaps', () => {
 assert.equal(productAudit({ ...base, salePrice: 220 }).critical, false);
 assert.equal(productAudit({ ...base, saleCurrency: 'USD', salePrice: 7 }).issues[0].code, 'negative-margin');
 assert.equal(productAudit({ ...base, saleCurrency: 'USD', salePrice: 30 }).issues[0].code, 'large-gap');
 assert.equal(productAudit({ ...base, salePrice: 220, shippingUsd: 0 }).issues[0].code, 'missing-shipping');
});
test('audit excludes archives and returns every anomalous listing', () => {
 const result = auditCatalogue([base, { ...base, id: 'b' }, { ...base, id: 'archive', archived: true }]);
 assert.equal(result.length, 2);
 assert.ok(result.every(item => item.issues.length));
});

const published = { ...base, id: 'published', salePrice: 220,
 cjPriceProposal: { savedAt: '2026-11-25T10:00:00Z' },
 wooPricePublication: { state: 'woo_verified', proposalSavedAt: '2026-11-25T10:00:00Z', at: '2026-11-25T11:00:00Z' } };
test('catalogue puts red products ahead of reviewed and published products across the full list', () => {
 const review = { ...base, id: 'review', salePrice: 220, pendingSourceChanges: true };
 const products = [published, review, ...Array.from({length: 100}, (_, i) => ({ ...published, id: `published-${i}` })), base];
 assert.deepEqual(products.sort(compareCataloguePriority).slice(0, 2).map(p => p.id), ['hoodie', 'review']);
 assert.equal(productRowClass(base), 'price-alert-row');
 assert.equal(productRowClass(review), 'source-review-row');
 assert.equal(productRowClass(published), 'price-success-row');
});
test('critical issues remain red even after publication or a source update', () => {
 const criticalPublished = { ...published, salePrice: 34 };
 const criticalSource = { ...base, pendingSourceChanges: true };
 assert.equal(productRowClass(criticalPublished), 'price-alert-row');
 assert.equal(productRowClass(criticalSource), 'price-alert-row');
 assert.ok(compareCataloguePriority(criticalPublished, { ...base, id: 'missing-cost', cjCostUsd: 0, salePrice: 220 }) < 0);
 assert.equal(isPublishedCurrent({ ...published, pendingSourceChanges: true }), false);
 assert.equal(isPublishedCurrent({ ...published, cjPriceProposal: null }), false);
 assert.equal(isPublishedCurrent({ ...published, cjPriceProposal: { savedAt: 'newer-draft' } }), false);
});
test('catalogue reuses precomputed audits and keeps recent valid publications first among green products', () => {
 const earlier = { ...published, id: 'earlier', wooPricePublication: { ...published.wooPricePublication, at: '2026-11-24T11:00:00Z' } };
 assert.ok(compareCataloguePriority(earlier, published) > 0);
 assert.equal(compareCataloguePriority(base, published), compareCataloguePriority(base, published, productAudit(base), productAudit(published)));
 assert.equal(published.salePrice, 220);
});
