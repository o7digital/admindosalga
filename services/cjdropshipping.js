const demoCatalog = [
  {
    pid: 'CJNS-24018',
    cjSku: 'CJNS-24018',
    name: 'Sculpt Seamless Set',
    brand: 'Dosalga Move',
    category: 'Activewear',
    cjCost: 18.4,
    currency: 'USD',
    stock: 86,
    variants: ['Black / S', 'Black / M', 'Stone / M'],
    logistics: [{ origin: 'CJ · China', destination: 'USA', method: 'CJPacket', shippingCost: 6.8, minDeliveryDays: 7, maxDeliveryDays: 12 }],
  },
  {
    pid: 'CJYD-18842',
    cjSku: 'CJYD-18842',
    name: 'Flex High-Waist Leggings',
    brand: 'Dosalga',
    category: 'Women',
    cjCost: 312,
    currency: 'MXN',
    stock: 34,
    variants: ['Navy / M', 'Black / L'],
    logistics: [{ origin: 'CJ · China', destination: 'México', method: 'CJPacket', shippingCost: 146, minDeliveryDays: 9, maxDeliveryDays: 15 }],
  },
];

const hasCredentials = () => Boolean(process.env.CJ_API_KEY || process.env.CJDROPSHIPPING_API_KEY);

const normalizeQuery = (input = '') => String(input).trim().toLowerCase();

export const importCjProduct = async ({ query, destination = 'USA' } = {}) => {
  if (!hasCredentials()) {
    const normalized = normalizeQuery(query);
    const product = demoCatalog.find((item) => normalizeQuery(`${item.pid} ${item.cjSku} ${item.name}`).includes(normalized)) || demoCatalog[0];
    const route = product.logistics.find((item) => item.destination === destination) || product.logistics[0];

    return {
      mode: 'demo',
      product: {
        ...product,
        logistics: product.logistics,
        selectedRoute: route,
        importedAt: new Date().toISOString(),
      },
    };
  }

  throw new Error('CJdropshipping API credentials detected, but the live adapter still needs endpoint mapping.');
};

export const syncCjProduct = async (product) => {
  const imported = await importCjProduct({
    query: product.pid || product.cjSku || product.sku || product.cjProductUrl,
    destination: product.shippingDestination || (product.siteId === 'dosalga-usa' ? 'USA' : 'México'),
  });
  const cjProduct = imported.product;
  const route = cjProduct.selectedRoute || cjProduct.logistics?.[0] || {};
  const changes = [];

  const compare = (field, oldValue, newValue) => {
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      changes.push({ field, oldValue, newValue });
    }
  };

  compare('cjCost', product.cjCost, cjProduct.cjCost);
  compare('shippingCost', product.shippingCost, route.shippingCost);
  compare('stock', product.stock, cjProduct.stock);

  return {
    mode: imported.mode,
    product: {
      ...product,
      pid: product.pid || cjProduct.pid,
      cjSku: product.cjSku || cjProduct.cjSku,
      cjCost: cjProduct.cjCost,
      cjCostCurrency: cjProduct.currency,
      shippingCost: route.shippingCost ?? product.shippingCost,
      shippingCurrency: cjProduct.currency,
      shippingOrigin: route.origin || product.shippingOrigin,
      shippingDestination: route.destination || product.shippingDestination,
      transportMethod: route.method || product.transportMethod,
      minDeliveryDays: route.minDeliveryDays || product.minDeliveryDays,
      maxDeliveryDays: route.maxDeliveryDays || product.maxDeliveryDays,
      stock: cjProduct.stock,
      lastCjSyncAt: new Date().toISOString(),
      cjChangeReport: changes,
    },
    changes,
  };
};
