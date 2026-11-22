import { createHash, timingSafeEqual } from 'node:crypto';
import { parseCjPrice } from './cjData.mjs';

export function cronAuthorized(authorization, secret) {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(String(authorization));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// REST amounts are major units; the Store API mapper expects minor units.
export function wooRestAsStoreProduct(product, currency) {
  const minor = value => String(Math.round((Number(value) || 0) * 100));
  return { ...product, is_in_stock: product.stock_status === 'instock', prices: {
    price: minor(product.price), regular_price: minor(product.regular_price),
    sale_price: minor(product.sale_price), currency_minor_unit: 2, currency_code: currency,
  } };
}

export function pendingCjProduct(product, market) {
  if (!['MX', 'US'].includes(market) || !product.productId || !product.sku) throw new Error('CJ product identity and market are required.');
  const siteId = market === 'MX' ? 'dosalga-mexico' : 'dosalga-usa';
  const currency = market === 'MX' ? 'MXN' : 'USD';
  return {
    id: `cj-${siteId}-${product.productId}`, siteId, stores: [siteId],
    sku: product.sku, cjSku: product.sku, pid: product.productId,
    name: String(product.nameEn || product.productName || product.sku), imageUrl: String(product.bigImage || ''),
    brand: 'Dosalga', category: product.categoryName || 'CJ · à classer', supplier: 'CJdropshipping',
    cjProductUrl: `https://www.cjdropshipping.com/product/-p-${encodeURIComponent(product.productId)}.html`,
    salePrice: 0, sourcePrice: 0, sourceCurrency: currency, saleCurrency: currency,
    cjCostUsd: 0, cjCost: 0, cjCostCurrency: 'USD',
    cjCatalogCostUsd: parseCjPrice(product.discountPrice || product.sellPrice),
    shippingIncluded: null, shippingUsd: 0, shippingCurrency: 'USD',
    shippingDestination: market === 'MX' ? 'México' : 'USA',
    stock: 0, minDeliveryDays: 0, maxDeliveryDays: 0, status: 'review', archived: false,
    catalogIntake: { source: 'cj-my-products', state: 'pending_review', needsWooListing: true },
    notes: 'Import CJ My Products : lister dans la boutique de ce marché, puis vérifier variantes, transport et prix avant publication.',
  };
}

export function sourceSnapshot(product, source, raw = {}) {
  const isCj = source === 'cj-my-products';
  const data = {
    name: product.name, sku: product.sku, image: product.imageUrl || '', category: product.category || '',
    ...(isCj ? { costUsd: product.cjCatalogCostUsd ?? parseCjPrice(raw.discountPrice || raw.sellPrice) }
      : { price: Number(product.salePrice), currency: product.saleCurrency, status: raw.status || 'publish',
        stockStatus: raw.stock_status || '', stock: raw.stock_quantity ?? null }),
  };
  return { data, revision: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}

export function sourceChanges(previous, current, listing) {
  if (!previous) return [];
  return Object.keys(current.data).filter(key => {
    if (!Object.hasOwn(previous.data, key)) return false;
    if (JSON.stringify(previous.data[key]) === JSON.stringify(current.data[key])) return false;
    // An admin publication comes back through WooCommerce on the next scan.
    if (key === 'price' && Number(current.data.price) === Number(listing.sale_price)
      && current.data.currency === listing.currency_code) return false;
    return true;
  });
}
