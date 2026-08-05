const storeSources = [
  {
    id: 'dosalga-mexico',
    name: 'Dosalga México',
    url: process.env.DOSALGA_MEXICO_WP_URL || 'https://oliviers44.sg-host.com',
    currency: 'MXN',
    destination: 'México',
  },
  {
    id: 'dosalga-usa',
    name: 'Dosalga USA',
    url: process.env.DOSALGA_USA_WP_URL || 'https://oliviers55.sg-host.com',
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
  const products = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL('/wp-json/wc/store/v1/products', source.url);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`${source.name} returned ${response.status}`);
    }

    const pageProducts = await response.json();
    if (!Array.isArray(pageProducts) || pageProducts.length === 0) break;
    products.push(...pageProducts);
    if (pageProducts.length < 100) break;
  }

  return products;
};

const mapWooProduct = (product, source) => {
  const category = product.categories?.[0]?.name || 'General';
  const stock = product.stock_quantity ?? (product.stock_status === 'instock' ? 25 : 0);
  const rawPrice = asNumber(product.prices?.price || product.price || product.sale_price || product.regular_price);
  const minorUnit = Number(product.prices?.currency_minor_unit ?? 2);
  const storePrice = rawPrice / (10 ** minorUnit);
  const salePrice = Number((source.id === 'dosalga-usa' ? storePrice / exchangeRate : storePrice).toFixed(2));
  const image = Array.isArray(product.images) ? product.images[0] : product.images;
  const imageUrl = image?.thumbnail || image?.src || '';
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
    productUrl: product.permalink || product.add_to_cart?.url || '',
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
