const storeSources = [
  {
    id: 'dosalga-mexico',
    name: 'Dosalga México',
    url: process.env.DOSALGA_MEXICO_APP_URL || process.env.DOSALGA_MX_APP_URL || 'https://www.dosalga.online',
    currency: 'MXN',
    destination: 'México',
  },
  {
    id: 'dosalga-usa',
    name: 'Dosalga USA',
    url: process.env.DOSALGA_USA_APP_URL || process.env.DOSALGA_US_APP_URL || 'https://www.dosalga.store',
    currency: 'USD',
    destination: 'USA',
  },
];

const asNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const exchangeRate = Number(process.env.USD_MXN_RATE) || 17.49;

const getMeta = (product, key) => {
  const meta = product.meta_data?.find((item) => item.key === key);
  return meta?.value;
};

const fetchStoreProducts = async (source) => {
  const url = new URL('/api/products', source.url);
  url.searchParams.set('all', 'true');
  url.searchParams.set('limit', '100');
  url.searchParams.set('lang', source.id === 'dosalga-mexico' ? 'es' : 'en');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`${source.name} returned ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error(`${source.name} returned an unexpected product payload`);
  }

  return payload.data;
};

const mapWooProduct = (product, source) => {
  const category = product.categories?.[0]?.name || 'General';
  const stock = product.stock_quantity ?? (product.stock_status === 'instock' ? 25 : 0);
  const salePrice = asNumber(product.price || product.sale_price || product.regular_price);
  const imageUrl = product.images?.[0]?.thumbnail || product.images?.[0]?.src || '';
  const cjCostUsd = asNumber(getMeta(product, 'cj_cost_usd') || getMeta(product, '_cj_cost_usd') || getMeta(product, 'cj_cost') || getMeta(product, '_cj_cost'));
  const shippingUsd = asNumber(getMeta(product, 'shipping_usd') || getMeta(product, '_shipping_usd') || getMeta(product, 'shipping_cost') || getMeta(product, '_shipping_cost'));
  const now = new Date().toISOString();

  return {
    id: `wp-${source.id}-${product.id}`,
    siteId: source.id,
    stores: [source.id],
    sku: String(product.sku || `WP-${product.id}`).trim(),
    cjSku: String(product.sku || '').trim(),
    pid: String(product.sku || product.id).trim(),
    name: String(product.name || 'Untitled product').trim(),
    brand: String(getMeta(product, 'brand') || 'Dosalga').trim(),
    category,
    imageUrl,
    productUrl: product.permalink || '',
    supplier: 'WooCommerce',
    cjProductUrl: product.permalink || '',
    quantityPlanned: asNumber(stock),
    stock: asNumber(stock),
    cjCost: cjCostUsd,
    cjCostUsd,
    cjCostCurrency: 'USD',
    salePrice,
    saleCurrency: source.currency,
    exchangeRate,
    shippingIncluded: true,
    shippingCost: shippingUsd,
    shippingUsd,
    shippingCurrency: 'USD',
    shippingOrigin: String(getMeta(product, 'shipping_origin') || 'WordPress · WooCommerce').trim(),
    shippingDestination: source.destination,
    transportMethod: String(getMeta(product, 'shipping_method') || 'Store shipping').trim(),
    minDeliveryDays: asNumber(getMeta(product, 'min_delivery_days') || 7),
    maxDeliveryDays: asNumber(getMeta(product, 'max_delivery_days') || 14),
    platformFeeRate: 0,
    taxRate: 0,
    status: product.status === 'publish' && stock !== 0 ? 'approved' : 'review',
    archived: false,
    lastWooImportAt: now,
    lastCjSyncAt: null,
    cjChangeReport: [],
    notes: `Imported from ${source.name} WordPress app (${source.url}).`,
    createdAt: product.date_created ? new Date(product.date_created).toISOString() : now,
    updatedAt: product.date_modified ? new Date(product.date_modified).toISOString() : now,
  };
};

export const importWordPressStores = async () => {
  const imports = await Promise.all(storeSources.map(async (source) => {
    const products = await fetchStoreProducts(source);
    return {
      source,
      products: products.map((product) => mapWooProduct(product, source)),
    };
  }));

  return {
    importedAt: new Date().toISOString(),
    products: imports.flatMap((item) => item.products),
    reports: imports.map((item) => ({
      store: item.source.id,
      name: item.source.name,
      count: item.products.length,
      sourceUrl: item.source.url,
    })),
  };
};
