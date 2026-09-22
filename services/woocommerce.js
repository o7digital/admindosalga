const requestTimeoutMs = Number(process.env.WOO_REQUEST_TIMEOUT_MS) || 20000;

const configFor = (market) => {
  const suffix = market === 'MX' ? 'MX' : 'US';
  const url = String(process.env[`DOSALGA_${suffix}_WP_URL`] || (market === 'MX'
    ? 'https://wp-dosalga-mx.o7digitalgroup.com'
    : 'https://wp-dosalga-us.o7digitalgroup.com')).replace(/\/$/, '');
  const key = String(process.env[`WOOCOMMERCE_${suffix}_CONSUMER_KEY`] || process.env[`DOSALGA_${suffix}_WC_CONSUMER_KEY`] || '').trim();
  const secret = String(process.env[`WOOCOMMERCE_${suffix}_CONSUMER_SECRET`] || process.env[`DOSALGA_${suffix}_WC_CONSUMER_SECRET`] || '').trim();
  return { url, key, secret };
};

export const hasWooWriteCredentials = (market) => {
  const { key, secret } = configFor(market);
  return Boolean(key && secret);
};

const request = async (market, path, options = {}) => {
  const { url, key, secret } = configFor(market);
  if (!key || !secret) {
    throw new Error(`WooCommerce ${market} write credentials are not configured. Add WOOCOMMERCE_${market}_CONSUMER_KEY and WOOCOMMERCE_${market}_CONSUMER_SECRET.`);
  }
  const response = await fetch(`${url}/wp-json/wc/v3${path}`, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `WooCommerce returned HTTP ${response.status}`);
  return payload;
};

const money = (price) => Number(price).toFixed(2);

const currencyMetaKeys = {
  origin: 'dosalga_price_origin_currency',
  source: 'dosalga_price_source_currency',
  display: 'dosalga_price_display_currency',
  value: 'dosalga_price_value_currency',
  exchangeRate: 'dosalga_mxn_per_usd',
};

const normalizedCurrency = (currency) => {
  const value = String(currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw new Error('A valid WooCommerce currency is required.');
  return value;
};

const normalizedExchangeRate = (exchangeRate) => {
  const value = Number(exchangeRate);
  if (!Number.isFinite(value) || value <= 0) throw new Error('A valid USD/MXN exchange rate is required.');
  return value;
};

const expectedCurrencyMeta = (sourceCurrency, displayCurrency, exchangeRate) => new Map([
  [currencyMetaKeys.origin, normalizedCurrency(sourceCurrency)],
  // WooCommerce stores the already calculated final amount. These markers
  // describe that stored value so no consumer converts it a second time.
  [currencyMetaKeys.source, normalizedCurrency(displayCurrency)],
  [currencyMetaKeys.display, normalizedCurrency(displayCurrency)],
  [currencyMetaKeys.value, normalizedCurrency(displayCurrency)],
  [currencyMetaKeys.exchangeRate, String(normalizedExchangeRate(exchangeRate))],
]);

// WooCommerce updates existing metadata reliably when its id is retained. Update
// every duplicate too: the storefront reads the first matching key, so leaving a
// stale duplicate could still apply an unwanted conversion.
export const wooCurrencyMetaUpdates = (metaData = [], sourceCurrency, displayCurrency, exchangeRate) => {
  const expected = expectedCurrencyMeta(sourceCurrency, displayCurrency, exchangeRate);
  const updates = [];
  expected.forEach((value, key) => {
    const existing = (Array.isArray(metaData) ? metaData : []).filter(item => item?.key === key);
    if (existing.length) {
      existing.forEach(item => updates.push({ ...(item.id !== undefined ? { id: item.id } : {}), key, value }));
    } else {
      updates.push({ key, value });
    }
  });
  return updates;
};

export const wooCurrencyMetaMatches = (metaData = [], sourceCurrency, displayCurrency, exchangeRate) => {
  const expected = expectedCurrencyMeta(sourceCurrency, displayCurrency, exchangeRate);
  return [...expected.entries()].every(([key, value]) => {
    const matches = (Array.isArray(metaData) ? metaData : []).filter(item => item?.key === key);
    if (!matches.length) return false;
    if (key === currencyMetaKeys.exchangeRate) {
      return matches.every(item => Number(item.value) === Number(value));
    }
    return matches.every(item => String(item.value || '').trim().toUpperCase() === value);
  });
};

const assertExpectedSku = (product, expectedSku = '') => {
  const wooSku = String(product?.sku || '').trim();
  const dashboardSku = String(expectedSku || '').trim();
  if (wooSku && dashboardSku && wooSku !== dashboardSku) {
    throw new Error(`WooCommerce SKU mismatch: expected ${dashboardSku}, received ${wooSku}. No change was made.`);
  }
};

const currencySettings = (identity, { currency, sourceCurrency, displayCurrency, exchangeRate = 17.49 } = {}) => {
  const normalizedDisplay = normalizedCurrency(displayCurrency || currency || identity.currency);
  const normalizedSource = normalizedCurrency(sourceCurrency || currency || normalizedDisplay);
  if (normalizedDisplay !== identity.currency) {
    throw new Error(`WooCommerce currency must be ${identity.currency} for the ${identity.market} store.`);
  }
  return { sourceCurrency: normalizedSource, displayCurrency: normalizedDisplay, exchangeRate: normalizedExchangeRate(exchangeRate) };
};

export const reviewWooPrice = async (identity, expectedSku = '') => {
  const product = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`);
  const dashboardSku = String(expectedSku || '').trim();
  assertExpectedSku(product, dashboardSku);
  if (product.status !== 'publish' || product.catalog_visibility === 'hidden') {
    throw new Error('WooCommerce product is not published or is hidden. No change was made.');
  }

  let targets;
  if (product.type === 'variable') {
    const variations = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations?per_page=100`);
    if (!Array.isArray(variations) || variations.length === 0) {
      return { productType: 'simple', productName: product.name, targets: [{ id: product.id, sku: product.sku || dashboardSku, title: product.name, price: product.price }], emptyVariable: true, parentMetaData: product.meta_data || [] };
    }
    targets = variations.map(variation => ({ id: variation.id, sku: variation.sku || '', title: variation.name || `Variation ${variation.id}`, price: variation.price }));
  } else {
    targets = [{ id: product.id, sku: product.sku || dashboardSku, title: product.name, price: product.price }];
  }
  return { productType: product.type || 'simple', productName: product.name, targets, parentMetaData: product.meta_data || [] };
};

export const publishWooPrice = async (identity, price, expectedSku = '', settings = {}) => {
  const review = await reviewWooPrice(identity, expectedSku);
  const { sourceCurrency, displayCurrency: currency, exchangeRate } = currencySettings(identity, settings);
  const meta_data = wooCurrencyMetaUpdates(review.parentMetaData, sourceCurrency, currency, exchangeRate);
  const update = { regular_price: money(price), sale_price: '' };
  const updatedVariations = [];
  let verifiedParent;

  if (review.productType === 'variable') {
    // Currency belongs to the parent product even when amounts live on its
    // variations. Set it first so the storefront cannot multiply a newly
    // published local-currency amount using stale parent metadata.
    await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`, {
      method: 'PUT',
      body: JSON.stringify({ meta_data }),
    });
    await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations/batch`, {
      method: 'POST',
      body: JSON.stringify({ update: review.targets.map(variation => ({ id: variation.id, ...update })) }),
    });
    const verified = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations?per_page=100`);
    const targetIds = new Set(review.targets.map(variation => String(variation.id)));
    verified.filter(variation => targetIds.has(String(variation.id))).forEach(variation => {
      updatedVariations.push({ id: variation.id, sku: variation.sku || '', price: variation.price });
    });
  } else {
    const updated = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`, {
      method: 'PUT', body: JSON.stringify(review.emptyVariable ? { ...update, type: 'simple', meta_data } : { ...update, meta_data }),
    });
    verifiedParent = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`);
    updatedVariations.push({ id: verifiedParent.id, sku: verifiedParent.sku || updated.sku, price: verifiedParent.price });
  }

  verifiedParent ||= await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`);
  const currencyVerified = wooCurrencyMetaMatches(verifiedParent.meta_data, sourceCurrency, currency, exchangeRate);
  if (!currencyVerified) {
    throw new Error('WooCommerce did not confirm the Railway currency metadata. The price publication could not be verified.');
  }

  return { productType: review.productType, updated: updatedVariations, sourceCurrency, currency, exchangeRate, currencyVerified };
};

const reconcileWooProductCurrency = async ({ identity, sourceCurrency, displayCurrency, exchangeRate, expectedSku = '' }) => {
  const settings = currencySettings(identity, { sourceCurrency, displayCurrency, exchangeRate });
  const path = `/products/${encodeURIComponent(identity.productId)}`;
  const current = await request(identity.market, path);
  assertExpectedSku(current, expectedSku);

  if (wooCurrencyMetaMatches(current.meta_data, settings.sourceCurrency, settings.displayCurrency, settings.exchangeRate)) {
    return { productId: String(identity.productId), market: identity.market, sourceCurrency: settings.sourceCurrency, displayCurrency: settings.displayCurrency, changed: false, verified: true };
  }

  await request(identity.market, path, {
    method: 'PUT',
    body: JSON.stringify({ meta_data: wooCurrencyMetaUpdates(current.meta_data, settings.sourceCurrency, settings.displayCurrency, settings.exchangeRate) }),
  });
  const verified = await request(identity.market, path);
  assertExpectedSku(verified, expectedSku);
  if (!wooCurrencyMetaMatches(verified.meta_data, settings.sourceCurrency, settings.displayCurrency, settings.exchangeRate)) {
    throw new Error(`WooCommerce did not confirm currency metadata for product ${identity.productId}.`);
  }
  return { productId: String(identity.productId), market: identity.market, sourceCurrency: settings.sourceCurrency, displayCurrency: settings.displayCurrency, changed: true, verified: true };
};

export const reconcileWooProductCurrencies = async (listings, { concurrency = 5, maxListings = 25 } = {}) => {
  if (!Array.isArray(listings) || listings.length === 0) throw new Error('At least one WooCommerce listing is required.');
  const safeMax = Math.max(1, Math.min(100, Number(maxListings) || 25));
  if (listings.length > safeMax) throw new Error(`Currency reconciliation is limited to ${safeMax} listings per request.`);
  const keys = listings.map(item => `${item?.identity?.market}:${item?.identity?.productId}`);
  if (keys.some(key => key.includes('undefined')) || new Set(keys).size !== keys.length) {
    throw new Error('Every WooCommerce listing identity must be present and unique.');
  }

  const safeConcurrency = Math.max(1, Math.min(10, Number(concurrency) || 5));
  const products = [];
  for (let offset = 0; offset < listings.length; offset += safeConcurrency) {
    const batch = listings.slice(offset, offset + safeConcurrency);
    products.push(...await Promise.all(batch.map(reconcileWooProductCurrency)));
  }
  return {
    requestedCount: products.length,
    repairedCount: products.filter(product => product.changed).length,
    unchangedCount: products.filter(product => !product.changed).length,
    products,
  };
};

export const freezeWooProduct = async (identity, expectedSku = '') => {
  const path = `/products/${encodeURIComponent(identity.productId)}`;
  const current = await request(identity.market, path);
  const wooSku = String(current.sku || '').trim();
  const dashboardSku = String(expectedSku || '').trim();

  if (wooSku && dashboardSku && wooSku !== dashboardSku) {
    throw new Error(`WooCommerce SKU mismatch: expected ${dashboardSku}, received ${wooSku}. No change was made.`);
  }

  const alreadyFrozen = current.status === 'draft' && current.catalog_visibility === 'hidden';
  const updated = alreadyFrozen ? current : await request(identity.market, path, {
    method: 'PUT',
    body: JSON.stringify({ status: 'draft', catalog_visibility: 'hidden' }),
  });

  if (updated.status !== 'draft' || updated.catalog_visibility !== 'hidden') {
    throw new Error('WooCommerce did not confirm that the product is draft and hidden.');
  }

  return {
    productId: String(updated.id),
    sku: updated.sku || dashboardSku,
    status: updated.status,
    catalogVisibility: updated.catalog_visibility,
    alreadyFrozen,
  };
};

export const listWooOrders = async (market, { perPage = 50 } = {}) => {
  const safePerPage = Math.max(1, Math.min(100, Number(perPage) || 50));
  const orders = await request(market, `/orders?per_page=${safePerPage}&orderby=date&order=desc`);
  if (!Array.isArray(orders)) throw new Error(`WooCommerce ${market} returned an invalid orders payload.`);
  return orders;
};

export const assignWooCategory = async (identity, categorySlug) => {
  const slug = String(categorySlug || '').trim().toLowerCase();
  if (!slug) throw new Error('A WooCommerce category slug is required.');
  const categories = await request(identity.market, `/products/categories?slug=${encodeURIComponent(slug)}&per_page=100`);
  const category = Array.isArray(categories) ? categories.find(item => item.slug === slug) : null;
  if (!category) throw new Error(`WooCommerce category "${slug}" was not found.`);
  const path = `/products/${encodeURIComponent(identity.productId)}`;
  const product = await request(identity.market, path);
  const ids = new Set((product.categories || []).map(item => Number(item.id)));
  ids.add(Number(category.id));
  await request(identity.market, path, {
    method: 'PUT',
    body: JSON.stringify({ categories: [...ids].map(id => ({ id })) }),
  });
  const verified = await request(identity.market, path);
  if (!(verified.categories || []).some(item => item.slug === slug)) {
    throw new Error(`WooCommerce did not confirm category "${slug}".`);
  }
  return { productId: verified.id, category: slug, categories: verified.categories };
};

export const repairWooCategoryCurrency = async ({ market = 'MX', categorySlug = 'caps', sourceCurrency = 'MXN', displayCurrency = 'MXN', exchangeRate = 1 } = {}) => {
  const slug = String(categorySlug || '').trim().toLowerCase();
  if (!slug) throw new Error('A WooCommerce category slug is required.');
  if (!['MXN', 'USD'].includes(sourceCurrency) || !['MXN', 'USD'].includes(displayCurrency)) {
    throw new Error('A valid source and display currency are required.');
  }
  const categories = await request(market, `/products/categories?slug=${encodeURIComponent(slug)}&per_page=100`);
  const category = Array.isArray(categories) ? categories.find(item => item.slug === slug) : null;
  if (!category) throw new Error(`WooCommerce category "${slug}" was not found.`);

  const products = [];
  for (let page = 1; page <= 50; page += 1) {
    const batch = await request(market, `/products?category=${encodeURIComponent(category.id)}&per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    products.push(...batch);
    if (batch.length < 100) break;
  }

  const repaired = [];
  for (let offset = 0; offset < products.length; offset += 5) {
    const batch = products.slice(offset, offset + 5);
    const results = await Promise.all(batch.map(async (summary) => {
      const product = await request(market, `/products/${encodeURIComponent(summary.id)}`);
      const keys = new Set(['dosalga_price_source_currency', 'dosalga_price_display_currency', 'dosalga_mxn_per_usd']);
      const meta = (product.meta_data || []).filter(item => !keys.has(item.key));
      meta.push({ key: 'dosalga_price_source_currency', value: sourceCurrency });
      meta.push({ key: 'dosalga_price_display_currency', value: displayCurrency });
      meta.push({ key: 'dosalga_mxn_per_usd', value: String(exchangeRate) });
      const updated = await request(market, `/products/${encodeURIComponent(summary.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ meta_data: meta }),
      });
      const verifiedMeta = new Map((updated.meta_data || []).map(item => [item.key, item.value]));
      if (verifiedMeta.get('dosalga_price_source_currency') !== sourceCurrency
        || verifiedMeta.get('dosalga_price_display_currency') !== displayCurrency) {
        throw new Error(`WooCommerce did not confirm currency metadata for product ${summary.id}.`);
      }
      return { id: updated.id, sku: updated.sku || summary.sku || '', name: updated.name || summary.name || '' };
    }));
    repaired.push(...results);
  }

  return {
    market,
    category: slug,
    categoryId: category.id,
    sourceCurrency,
    displayCurrency,
    exchangeRate: Number(exchangeRate),
    repairedCount: repaired.length,
    products: repaired,
    message: `Updated ${repaired.length} WooCommerce products in ${slug}. Product amounts were not changed; storefront currency metadata was corrected.`,
  };
};
