import test from 'node:test';
import assert from 'node:assert/strict';
import { productAudit, auditCatalogue, compareProductPriority } from '../lib/productAlerts.mjs';
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
