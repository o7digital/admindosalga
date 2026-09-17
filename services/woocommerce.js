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
    if (!Array.isArray(variations) || variations.length === 0) throw new Error('WooCommerce variable product has no variations to update.');
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
    for (const variation of review.targets) {
      const updated = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations/${encodeURIComponent(variation.id)}`, {
        method: 'PUT', body: JSON.stringify(update),
      });
      const verified = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations/${encodeURIComponent(variation.id)}`);
      updatedVariations.push({ id: verified.id, sku: verified.sku || updated.sku, price: verified.price });
    }
  } else {
    const updated = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`, {
      method: 'PUT', body: JSON.stringify(update),
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
