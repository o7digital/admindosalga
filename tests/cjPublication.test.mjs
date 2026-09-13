import test from 'node:test';
import assert from 'node:assert/strict';
import { listingIdentity, selectShop, publicationVariants, allVariantsAccepted } from '../lib/cjPublication.mjs';
const identity = listingIdentity({ id: 'wp-dosalga-mexico-123' });
const shop = { id: 'shop', name: 'wp-dosalga-mx.o7digitalgroup.com', type: 'Woocommerce', status: 1, currencyCode: 'MXN' };
const detail = { platformProductId: '123', platformProductPricesCurrency: 'MXN', shopProductStatus: 1, variants: [{ platformProductId: '123', platformVariantId: 'v1', platformVariantSku: 'sku', platformVariantTitle: 'Large', platformVariantImage: 'https://example.com/image.jpg', priceCurrency: 'MXN' }] };
test('exact shop/market identity; no guessed or foreign shop', () => {
 assert.equal(selectShop([shop], identity).id, 'shop');
 assert.throws(() => selectShop([{ ...shop, name: 'other.com' }], identity));
 assert.throws(() => selectShop([shop,shop], identity));
 assert.throws(() => listingIdentity({ id: 'wp-dosalga-mexico-123', archived: true }));
});
test('variant price payload uses store identities and matching currency only', () => {
 const variants = publicationVariants(detail, identity, { currency: 'MXN', price: 300 });
 assert.equal(variants[0].shopPrice, 300);
 assert.equal(variants[0].id, 'v1');
 assert.throws(() => publicationVariants(detail, identity, { currency: 'USD', price: 300 }));
 assert.throws(() => publicationVariants({ ...detail, variants: [] }, identity, { currency: 'MXN' }));
 assert.equal(publicationVariants({ ...detail, shopProductStatus: 3 }, identity, { currency: 'MXN', price: 300 }).length, 1);
 assert.equal(allVariantsAccepted(variants, []), false);
 assert.equal(allVariantsAccepted(variants, [{ id: 'v1', productId: '123', saveSuccess: false }]), false);
 assert.equal(allVariantsAccepted(variants, [{ id: 'v1', productId: '123', saveSuccess: true }]), true);
});
