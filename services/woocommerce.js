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

export const reviewWooPrice = async (identity, expectedSku = '') => {
  const product = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`);
  const wooSku = String(product.sku || '').trim();
  const dashboardSku = String(expectedSku || '').trim();
  if (wooSku && dashboardSku && wooSku !== dashboardSku) {
    throw new Error(`WooCommerce SKU mismatch: expected ${dashboardSku}, received ${wooSku}. No change was made.`);
  }
  if (product.status !== 'publish' || product.catalog_visibility === 'hidden') {
    throw new Error('WooCommerce product is not published or is hidden. No change was made.');
  }

  let targets;
  if (product.type === 'variable') {
    const variations = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations?per_page=100`);
    if (!Array.isArray(variations) || variations.length === 0) {
      return { productType: 'simple', productName: product.name, targets: [{ id: product.id, sku: product.sku || dashboardSku, title: product.name, price: product.price }], emptyVariable: true };
    }
    targets = variations.map(variation => ({ id: variation.id, sku: variation.sku || '', title: variation.name || `Variation ${variation.id}`, price: variation.price }));
  } else {
    targets = [{ id: product.id, sku: product.sku || dashboardSku, title: product.name, price: product.price }];
  }
  return { productType: product.type || 'simple', productName: product.name, targets };
};

export const publishWooPrice = async (identity, price, expectedSku = '') => {
  const review = await reviewWooPrice(identity, expectedSku);
  const update = { regular_price: money(price), sale_price: '' };
  const updatedVariations = [];

  if (review.productType === 'variable') {
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
      method: 'PUT', body: JSON.stringify(review.emptyVariable ? { ...update, type: 'simple' } : update),
    });
    const verified = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`);
    updatedVariations.push({ id: verified.id, sku: verified.sku || updated.sku, price: verified.price });
  }

  return { productType: review.productType, updated: updatedVariations };
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
