import { normalizeWooPrice } from '../lib/wooPricing.mjs';

const storeSources = [
  {
    id: 'dosalga-mexico',
    name: 'Dosalga México',
    url: process.env.DOSALGA_MEXICO_WP_URL || 'https://wp-dosalga-mx.o7digitalgroup.com',
    storefrontUrl: process.env.DOSALGA_MEXICO_STOREFRONT_URL || 'https://www.dosalga.online',
    catalogPath: '/api/products',
    catalogQuery: { lang: 'es', per_page: '24', orderby: 'date', order: 'desc' },
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

const normalizeCurrency = (value, fallback) => {
  const currency = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
};

const exchangeRate = Number(process.env.USD_MXN_RATE) || 17.49;

const getMeta = (product, key) => {
  const meta = product.meta_data?.find((item) => item.key === key);
  return meta?.value;
};

const fetchStoreProducts = async (source) => {
  const catalogUrl = source.catalogPath ? new URL(source.catalogPath, source.storefrontUrl) : null;
  const pageSize = Number(source.catalogQuery?.per_page || 100);
  const fetchPage = async (page) => {
    const url = catalogUrl ? new URL(catalogUrl) : new URL('/wp-json/wc/store/v1/products', source.url);
    if (catalogUrl) {
      Object.entries(source.catalogQuery || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    } else {
      url.searchParams.set('per_page', '100');
    }
    url.searchParams.set('page', String(page));
    if (!catalogUrl) url.searchParams.set('_fields', 'id,name,permalink,sku,prices,images,categories,is_in_stock,low_stock_remaining');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`${source.name} returned ${response.status}`);
    }

    const payload = await response.json();
    const pageProducts = catalogUrl ? payload.data : payload;
    if (!Array.isArray(pageProducts)) {
      throw new Error(`${source.name} returned an unexpected product payload`);
    }

    return {
      products: pageProducts,
      totalPages: Number(response.headers.get('x-wp-totalpages')) || null,
      hasMore: catalogUrl ? pageProducts.length >= pageSize : false,
    };
  };

  const firstPage = await fetchPage(1);
  if (!catalogUrl) {
    const totalPages = Math.min(firstPage.totalPages || 1, 10);
    if (totalPages <= 1) return firstPage.products;
    const remainingPages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2)));
    return [firstPage, ...remainingPages].flatMap((page) => page.products);
  }

  const pages = [firstPage];
  let nextPage = 2;
  while (pages[pages.length - 1].hasMore && nextPage <= 50) {
    const batch = await Promise.all(Array.from({ length: 5 }, (_, index) => fetchPage(nextPage + index)));
    pages.push(...batch);
    if (batch.some((page) => page.products.length < pageSize)) break;
    nextPage += batch.length;
  }
  return pages.flatMap((page) => page.products);
};

const mapWooProduct = (product, source) => {
  const category = product.categories?.[0]?.name || 'General';
  const categorySlug = product.categories?.[0]?.slug || '';
  const isCapsNativeMx = source.id === 'dosalga-mexico'
    && (categorySlug.toLowerCase() === 'caps' || category.trim().toLowerCase() === 'caps');
  const isInStock = product.is_in_stock ?? product.stock_status === 'instock';
  const stock = product.stock_quantity ?? (isInStock ? 25 : 0);
  const storefrontPrice = asNumber(product.price);
  const rawPrice = isCapsNativeMx
    ? asNumber(product.prices?.price || product.sale_price || product.regular_price)
    : (storefrontPrice || asNumber(product.prices?.price || product.sale_price || product.regular_price));
  const minorUnit = Number(product.prices?.currency_minor_unit ?? 2);
  const storePrice = !isCapsNativeMx && storefrontPrice ? rawPrice : rawPrice / (10 ** minorUnit);
  const salePrice = Number(storePrice.toFixed(2));
  const nativeWooCurrency = normalizeCurrency(product.prices?.currency_code, source.currency);
  const importedCurrency = isCapsNativeMx
    ? nativeWooCurrency
    : normalizeCurrency(getMeta(product, 'dosalga_price_display_currency') || nativeWooCurrency, source.currency);
  const sourceCurrency = isCapsNativeMx
    ? importedCurrency
    : normalizeCurrency(getMeta(product, 'dosalga_price_source_currency'), importedCurrency);
  const importedExchangeRate = asNumber(getMeta(product, 'dosalga_mxn_per_usd')) || exchangeRate;
  const sourcePrice = !isCapsNativeMx && sourceCurrency !== importedCurrency && product.prices?.price
    ? Number((asNumber(product.prices.price) / (10 ** minorUnit)).toFixed(2))
    : salePrice;
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
    saleCurrency: importedCurrency,
    sourcePrice,
    sourceCurrency,
    importedCurrency,
    importedCurrencySource: isCapsNativeMx ? 'woocommerce.prices.currency_code · CAPS native MXN rule' : product.meta_data?.length ? 'dosalga.online.product.price + meta_data' : 'woocommerce.prices.currency_code',
    priceImportRule: isCapsNativeMx ? 'caps-native-mxn-v1' : 'storefront-display-price',
    expectedStoreCurrency: source.currency,
    currencyMismatch: importedCurrency !== source.currency,
    exchangeRate: importedExchangeRate,
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
    notes: `Imported from ${source.name} storefront (${source.storefrontUrl || source.url}); displayed currency ${importedCurrency}, source currency ${sourceCurrency}.`,
    createdAt: product.date_created ? new Date(product.date_created).toISOString() : now,
    updatedAt: product.date_modified ? new Date(product.date_modified).toISOString() : now,
  };
};

export const importWordPressStores = async () => {
  const imports = await Promise.all(storeSources.map(async (source) => {
    const products = await fetchStoreProducts(source);
    return {
      source,
      products: products.map((product) => normalizeWooPrice(mapWooProduct(product, source))),
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
