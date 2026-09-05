const CJ_API_BASE_URL = process.env.CJ_API_BASE_URL || 'https://developers.cjdropshipping.com/api2.0/v1';
const CJ_REQUEST_TIMEOUT_MS = Number(process.env.CJ_REQUEST_TIMEOUT_MS) || 20000;

let cachedToken = null;

const getApiKey = () => String(process.env.CJ_API_KEY || process.env.CJDROPSHIPPING_API_KEY || '').trim();
const getStaticAccessToken = () => String(process.env.CJ_ACCESS_TOKEN || '').trim();

export const hasCjCredentials = () => Boolean(getApiKey() || getStaticAccessToken());

const asNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CJ_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.message || `CJ API returned HTTP ${response.status}`);
    }

    if (!payload || payload.result === false || payload.success === false) {
      throw new Error(payload?.message || 'CJ API returned an invalid response');
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`CJ API timed out after ${CJ_REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const getAccessToken = async () => {
  const staticToken = getStaticAccessToken();
  if (staticToken) return staticToken;

  if (cachedToken?.value && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.value;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('CJ_API_KEY is not configured. Add the CJ API key to the server environment.');
  }

  const payload = await fetchJson(`${CJ_API_BASE_URL}/authentication/getAccessToken`, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
  const accessToken = String(payload.data?.accessToken || '').trim();

  if (!accessToken) {
    throw new Error('CJ authentication succeeded without returning an access token.');
  }

  const reportedExpiry = Date.parse(payload.data?.accessTokenExpiryDate || '');
  cachedToken = {
    value: accessToken,
    expiresAt: Number.isFinite(reportedExpiry) ? reportedExpiry : Date.now() + (14 * 24 * 60 * 60 * 1000),
  };

  return accessToken;
};

const cjRequest = async (path, { method = 'GET', query, body } = {}) => {
  const accessToken = await getAccessToken();
  const url = new URL(`${CJ_API_BASE_URL}${path}`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return fetchJson(url.toString(), {
    method,
    headers: { 'CJ-Access-Token': accessToken },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
};

const extractIdentifier = (input = '') => {
  const raw = String(input || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const queryIdentifier = url.searchParams.get('pid') || url.searchParams.get('productId') || url.searchParams.get('id');
    if (queryIdentifier) return queryIdentifier.trim();

    const productPath = url.pathname.match(/\/product\/(?:[^/]+-)?([a-z0-9-]{8,})(?:\.html)?\/?$/i);
    if (productPath) return productPath[1];
  } catch {
    // The value is a PID/SKU rather than a URL.
  }

  return raw;
};

const looksLikePid = (value) => (
  /^\d{16,}$/.test(value)
  || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)
);

const queryProduct = async (input) => {
  const identifier = extractIdentifier(input);
  if (!identifier) throw new Error('A CJ product URL, PID or SKU is required.');

  const attempts = looksLikePid(identifier)
    ? [{ pid: identifier }, { productSku: identifier }]
    : [{ productSku: identifier }, { variantSku: identifier }];
  let lastError;

  for (const query of attempts) {
    try {
      const payload = await cjRequest('/product/query', { query });
      if (payload.data) return { data: payload.data, identifier };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`CJ product not found for ${identifier}`);
};

const variantPrice = (variant) => asNumber(variant?.variantSellPrice || variant?.sellPrice);

const selectVariant = (product, identifier) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const exact = variants.find((variant) => (
    String(variant.variantSku || '').toLowerCase() === String(identifier).toLowerCase()
  ));

  if (exact) return exact;
  return [...variants].sort((left, right) => variantPrice(left) - variantPrice(right))[0] || null;
};

const inventoryForProduct = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.reduce((productTotal, variant) => {
    const inventories = Array.isArray(variant.inventories) ? variant.inventories : [];
    return productTotal + inventories.reduce((variantTotal, inventory) => (
      variantTotal + asNumber(inventory.totalInventory ?? inventory.totalInventoryNum)
    ), 0);
  }, 0);
};

const parseAging = (aging) => {
  const days = String(aging || '').match(/\d+/g)?.map(Number) || [];
  return {
    minDeliveryDays: days[0] || 0,
    maxDeliveryDays: days[1] || days[0] || 0,
  };
};

const destinationCountryCode = (destination) => {
  const normalized = String(destination || '').trim().toLowerCase();
  if (['mx', 'mexico', 'méxico'].includes(normalized)) return 'MX';
  return 'US';
};

const getLogistics = async (variant, destination) => {
  if (!variant?.vid) return [];

  const payload = await cjRequest('/logistic/freightCalculate', {
    method: 'POST',
    body: {
      startCountryCode: 'CN',
      endCountryCode: destinationCountryCode(destination),
      products: [{ quantity: 1, vid: variant.vid }],
    },
  });

  return (Array.isArray(payload.data) ? payload.data : [])
    .map((route) => ({
      origin: 'CJ · China',
      destination: destinationCountryCode(destination) === 'MX' ? 'México' : 'USA',
      method: route.logisticName || 'CJ logistics',
      shippingCost: asNumber(route.totalPostageFee ?? route.logisticPrice),
      ...parseAging(route.logisticAging),
    }))
    .sort((left, right) => left.shippingCost - right.shippingCost);
};

export const getCjConnectionStatus = async ({ verify = false } = {}) => {
  const configured = hasCjCredentials();
  if (!configured) return { configured: false, connected: false, mode: 'setup' };

  if (!verify) return { configured: true, connected: true, mode: 'live' };

  await cjRequest('/setting/get');
  return { configured: true, connected: true, mode: 'live' };
};

export const importCjProduct = async ({ query, destination = 'USA', includeFreight = true } = {}) => {
  const result = await queryProduct(query);
  const cjProduct = result.data;
  const variant = selectVariant(cjProduct, result.identifier);
  let logistics = [];

  if (includeFreight) {
    try {
      logistics = await getLogistics(variant, destination);
    } catch {
      // Product cost and stock are still useful if CJ has no route for this destination.
    }
  }

  const cjCost = variantPrice(variant) || asNumber(cjProduct.sellPrice);

  return {
    mode: 'live',
    product: {
      pid: String(cjProduct.pid || variant?.pid || '').trim(),
      cjSku: String(cjProduct.productSku || variant?.variantSku || result.identifier).trim(),
      name: String(cjProduct.productNameEn || cjProduct.productName || '').trim(),
      brand: String(cjProduct.supplierName || 'CJdropshipping').trim(),
      category: String(cjProduct.categoryName || 'General').trim(),
      imageUrl: String(cjProduct.bigImage || cjProduct.productImageSet?.[0] || '').trim(),
      cjCost,
      currency: 'USD',
      stock: inventoryForProduct(cjProduct),
      variants: (cjProduct.variants || []).map((item) => item.variantSku).filter(Boolean),
      logistics,
      selectedRoute: logistics[0] || null,
      importedAt: new Date().toISOString(),
    },
  };
};

export const syncCjProduct = async (product, { includeFreight = false } = {}) => {
  const imported = await importCjProduct({
    query: product.pid || product.cjSku || product.sku || product.cjProductUrl,
    destination: product.shippingDestination || (product.siteId === 'dosalga-usa' ? 'USA' : 'México'),
    includeFreight,
  });
  const cjProduct = imported.product;
  const route = cjProduct.selectedRoute || {};
  const changes = [];

  const compare = (field, oldValue, newValue) => {
    if (newValue !== undefined && newValue !== null && String(oldValue ?? '') !== String(newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  };

  compare('cjCostUsd', product.cjCostUsd ?? product.cjCost, cjProduct.cjCost);
  if (includeFreight && route.shippingCost !== undefined) {
    compare('shippingUsd', product.shippingUsd ?? product.shippingCost, route.shippingCost);
  }
  compare('stock', product.stock, cjProduct.stock);

  return {
    mode: imported.mode,
    product: {
      ...product,
      pid: cjProduct.pid || product.pid,
      cjSku: cjProduct.cjSku || product.cjSku,
      supplier: 'CJdropshipping',
      cjCost: cjProduct.cjCost,
      cjCostUsd: cjProduct.cjCost,
      cjCostCurrency: 'USD',
      ...(includeFreight && route.shippingCost !== undefined ? {
        shippingCost: route.shippingCost,
        shippingUsd: route.shippingCost,
        shippingCurrency: 'USD',
        shippingOrigin: route.origin || product.shippingOrigin,
        shippingDestination: route.destination || product.shippingDestination,
        transportMethod: route.method || product.transportMethod,
        minDeliveryDays: route.minDeliveryDays || product.minDeliveryDays,
        maxDeliveryDays: route.maxDeliveryDays || product.maxDeliveryDays,
      } : {}),
      stock: cjProduct.stock,
      lastCjSyncAt: new Date().toISOString(),
      cjChangeReport: changes,
      updatedAt: new Date().toISOString(),
    },
    changes,
  };
};
