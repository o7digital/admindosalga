const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizePriceToken = (token) => {
  const value = String(token || '').trim();
  if (!value) return null;

  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  let normalized = value;

  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '');
  } else if (comma >= 0) {
    const decimals = value.length - comma - 1;
    normalized = decimals > 0 && decimals <= 2
      ? value.replace(',', '.')
      : value.replace(/,/g, '');
  }

  const number = finiteNumber(normalized);
  return number !== null && number > 0 ? number : null;
};

/**
 * CJ occasionally returns a product price as a range (for example "6.62-7.10")
 * instead of a scalar. The lower positive price is the conservative product cost.
 */
export const parseCjPrice = (value) => {
  const direct = finiteNumber(value);
  if (direct !== null) return direct > 0 ? direct : 0;

  const prices = String(value || '')
    .match(/\d[\d,.]*/g)
    ?.map(normalizePriceToken)
    .filter((price) => price !== null) || [];

  return prices.length ? Math.min(...prices) : 0;
};

const hasValue = (value) => value !== undefined && value !== null && value !== '';

export const applyCjCostUpdate = (product, cjProduct, now = new Date().toISOString()) => {
  const cjCost = parseCjPrice(cjProduct?.cjCost);
  if (!(cjCost > 0)) {
    throw new Error(`CJ returned no valid positive USD cost for ${product?.cjSku || product?.pid || product?.sku || 'this product'}.`);
  }

  const previousCost = parseCjPrice(product?.cjCostUsd ?? product?.cjCost);
  const changes = previousCost === cjCost
    ? []
    : [{ field: 'cjCostUsd', oldValue: previousCost, newValue: cjCost }];
  const cjStock = finiteNumber(cjProduct?.stock);

  return {
    product: {
      ...product,
      pid: cjProduct?.pid || product?.pid,
      cjSku: cjProduct?.cjSku || product?.cjSku,
      supplier: 'CJdropshipping',
      cjCost,
      cjCostUsd: cjCost,
      cjCostCurrency: 'USD',
      ...(cjStock !== null && cjStock >= 0 ? { cjStock } : {}),
      imageUrl: product?.imageUrl || cjProduct?.imageUrl || '',
      lastCjSyncAt: now,
      cjChangeReport: changes,
      updatedAt: now,
    },
    changes,
  };
};

const linkedCjFields = [
  'pid',
  'cjSku',
  'cjProductUrl',
  'supplier',
  'lastCjSyncAt',
  'cjChangeReport',
  'cjStock',
];

const shippingFields = [
  'shippingCost',
  'shippingUsd',
  'shippingCurrency',
  'shippingOrigin',
  'shippingDestination',
  'transportMethod',
  'minDeliveryDays',
  'maxDeliveryDays',
];

/** Keep supplier-owned data when a fresh WooCommerce record has no CJ metadata. */
export const mergeCjDataIntoWordPressProduct = (incoming, existing) => {
  if (!existing) return { ...incoming };

  const previousCost = parseCjPrice(existing.cjCostUsd ?? existing.cjCost);
  const wasLinked = previousCost > 0 || hasValue(existing.lastCjSyncAt);
  if (!wasLinked) return { ...incoming };

  const merged = { ...incoming };
  linkedCjFields.forEach((field) => {
    if (hasValue(existing[field])) merged[field] = existing[field];
  });

  if (previousCost > 0) {
    merged.cjCost = previousCost;
    merged.cjCostUsd = previousCost;
    merged.cjCostCurrency = existing.cjCostCurrency || 'USD';
  }

  if (parseCjPrice(existing.shippingUsd ?? existing.shippingCost) > 0) {
    shippingFields.forEach((field) => {
      if (hasValue(existing[field])) merged[field] = existing[field];
    });
  }

  return merged;
};

/** Overlay normalized relational CJ data on the JSON listing metadata. */
export const overlayCjSnapshot = (metadata = {}, snapshot = {}) => {
  const cost = parseCjPrice(snapshot.productCost);
  const merged = { ...metadata };

  if (hasValue(snapshot.pid)) merged.pid = snapshot.pid;
  if (hasValue(snapshot.sku)) merged.cjSku = snapshot.sku;
  if (hasValue(snapshot.productUrl)) merged.cjProductUrl = snapshot.productUrl;

  if (cost > 0) {
    merged.cjCost = cost;
    merged.cjCostUsd = cost;
    merged.cjCostCurrency = snapshot.currency || metadata.cjCostCurrency || 'USD';
    if (hasValue(snapshot.availableStock)) merged.cjStock = Number(snapshot.availableStock);
    if (hasValue(snapshot.capturedAt)) merged.lastCjSyncAt = snapshot.capturedAt;
  }

  return merged;
};
