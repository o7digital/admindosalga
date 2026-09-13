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

export const publishWooPrice = async (identity, price) => {
  const product = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`);
  const update = { regular_price: money(price), sale_price: '' };
  const updatedVariations = [];

  if (product.type === 'variable') {
    const variations = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations?per_page=100`);
    if (!Array.isArray(variations) || variations.length === 0) throw new Error('WooCommerce variable product has no variations to update.');
    for (const variation of variations) {
      const updated = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}/variations/${encodeURIComponent(variation.id)}`, {
        method: 'PUT', body: JSON.stringify(update),
      });
      updatedVariations.push({ id: updated.id, sku: updated.sku, price: updated.price });
    }
  } else {
    const updated = await request(identity.market, `/products/${encodeURIComponent(identity.productId)}`, {
      method: 'PUT', body: JSON.stringify(update),
    });
    updatedVariations.push({ id: updated.id, sku: updated.sku, price: updated.price });
  }

  return { productType: product.type || 'simple', updated: updatedVariations };
};
