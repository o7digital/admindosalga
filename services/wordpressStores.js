const storeSources = [
  {
    id: 'dosalga-mexico',
    name: 'Dosalga México',
    url: process.env.DOSALGA_MEXICO_WP_URL || 'https://wp-dosalga-mx.o7digitalgroup.com',
    currency: 'MXN',
    destination: 'México',
  },
  {
    id: 'dosalga-usa',
    name: 'Dosalga USA',
    url: process.env.DOSALGA_USA_WP_URL || 'https://wp-dosalga-us.o7digitalgroup.com',
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
  const fetchPage = async (page) => {
    const url = new URL('/wp-json/wc/store/v1/products', source.url);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,name,permalink,sku,prices,images,categories,is_in_stock,low_stock_remaining');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`${source.name} returned ${response.status}`);
    }

    const pageProducts = await response.json();
    if (!Array.isArray(pageProducts)) {
      throw new Error(`${source.name} returned an unexpected product payload`);
    }

    return {
      products: pageProducts,
      totalPages: Number(response.headers.get('x-wp-totalpages')) || 1,
    };
  };

  const firstPage = await fetchPage(1);
  const totalPages = Math.min(firstPage.totalPages, 10);
  if (totalPages <= 1) return firstPage.products;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2))
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.products);
};

const mapWooProduct = (product, source) => {
  const category = product.categories?.[0]?.name || 'General';
  const isInStock = product.is_in_stock ?? product.stock_status === 'instock';
  const stock = product.stock_quantity ?? (isInStock ? 25 : 0);
  const rawPrice = asNumber(product.prices?.price || product.price || product.sale_price || product.regular_price);
  const minorUnit = Number(product.prices?.currency_minor_unit ?? 2);
  const storePrice = rawPrice / (10 ** minorUnit);
  // The US backend currently exposes MXN-denominated numeric values while labelling them USD.
  // Preserve the existing normalization until the source catalogue is corrected.
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
    status: stock !== 0 ? 'approved' : 'review',
    archived: false,
    lastWooImportAt: now,
    lastCjSyncAt: null,
    cjChangeReport: [],
    notes: `Imported from ${source.name} WooCommerce backend (${source.url}).`,
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
