export const isPendingUsImport = (product) => product?.marketImport?.status === 'pending_us_review';

export const pendingUsProduct = (source, importedAt = new Date().toISOString()) => {
  const original = source.metadata || {};
  const sku = String(source.woo_sku || '').trim();
  if (!sku) throw new Error('A market import requires a SKU.');
  return {
    id: `railway-us-import-${source.id}`,
    siteId: 'dosalga-usa', stores: ['dosalga-usa'],
    sku, cjSku: original.cjSku || sku, pid: original.pid || sku,
    name: source.canonical_name, brand: source.brand || 'Dosalga',
    category: source.category || 'General', imageUrl: source.image_url || original.imageUrl || '',
    supplier: original.supplier || 'CJdropshipping',
    cjCost: Number(original.cjCostUsd || 0), cjCostUsd: Number(original.cjCostUsd || 0), cjCostCurrency: 'USD',
    productUrl: '', cjProductUrl: '',
    salePrice: 0, saleCurrency: 'USD', sourcePrice: 0, sourceCurrency: 'USD',
    shippingCost: 0, shippingUsd: 0, shippingCurrency: 'USD',
    shippingIncluded: null, shippingConfirmed: false,
    shippingOrigin: '', shippingDestination: 'USA', transportMethod: '',
    minDeliveryDays: 0, maxDeliveryDays: 0, stock: 0,
    status: 'review', archived: false,
    marketImport: {
      status: 'pending_us_review', sourceStore: 'MX', targetStore: 'US',
      sourceListingId: source.id, sourceWooProductId: source.woo_product_id,
      sourcePrice: Number(source.sale_price), sourceCurrency: 'MXN',
      sourceBlocked: original.wooFrozen === true,
      importedAt,
    },
    notes: 'Import MX : prix, livraison et mise en vente US à préparer.',
  };
};
