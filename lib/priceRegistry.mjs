const currencies = new Set(['USD', 'MXN']);

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : null;
};

const currency = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return currencies.has(normalized) ? normalized : null;
};

export const finalPriceFor = (rawPrice, rawCurrency, finalCurrency, exchangeRate) => {
  const raw = money(rawPrice);
  const source = currency(rawCurrency);
  const display = currency(finalCurrency);
  const rate = Number(exchangeRate);
  if (raw === null || !source || !display || !Number.isFinite(rate) || rate <= 0) return null;
  if (source === display) return raw;
  if (source === 'USD' && display === 'MXN') return money(raw * rate);
  if (source === 'MXN' && display === 'USD') return money(raw / rate);
  return null;
};

export const registryFromProduct = (product = {}) => {
  const existing = product.priceRegistry || {};
  const rawPrice = money(product.sourcePrice ?? existing.rawPrice ?? product.salePrice);
  const rawCurrency = currency(product.sourceCurrency || existing.rawCurrency);
  const finalCurrency = currency(product.saleCurrency || existing.finalCurrency);
  const exchangeRate = Number(product.exchangeRate ?? existing.exchangeRate ?? 17.49);
  const computedFinal = finalPriceFor(rawPrice, rawCurrency, finalCurrency, exchangeRate);
  const finalPrice = money(product.salePrice ?? existing.finalPrice ?? computedFinal);
  if (rawPrice === null || !rawCurrency || !finalCurrency || finalPrice === null || !(exchangeRate > 0)) return null;

  const adminVerified = product.sourceManagedByAdmin === true
    || product.wooPricePublication?.state === 'woo_verified';
  return {
    rawPrice,
    rawCurrency,
    exchangeRate,
    finalPrice,
    finalCurrency,
    decisionSource: adminVerified
      ? 'admin-woo-publication'
      : String(existing.decisionSource || product.priceDecisionSource || product.importedCurrencySource || 'woocommerce-import-unverified'),
    verified: adminVerified || existing.verified === true || product.priceSourceVerified === true,
    evidence: existing.evidence || {
      importedCurrency: product.importedCurrency || null,
      priceImportRule: product.priceImportRule || null,
    },
  };
};

export const applyPriceRegistry = (product = {}, registry = null) => {
  if (!registry) return product;
  return {
    ...product,
    sourcePrice: money(registry.rawPrice),
    sourceCurrency: currency(registry.rawCurrency),
    exchangeRate: Number(registry.exchangeRate),
    salePrice: money(registry.finalPrice),
    saleCurrency: currency(registry.finalCurrency),
    sourceManagedByAdmin: registry.decisionSource === 'admin-woo-publication'
      || product.sourceManagedByAdmin === true,
    priceRegistry: {
      rawPrice: money(registry.rawPrice),
      rawCurrency: currency(registry.rawCurrency),
      exchangeRate: Number(registry.exchangeRate),
      finalPrice: money(registry.finalPrice),
      finalCurrency: currency(registry.finalCurrency),
      decisionSource: registry.decisionSource,
      verified: registry.verified === true,
      evidence: registry.evidence || {},
      updatedAt: registry.updatedAt || null,
    },
  };
};

// A Woo import supplies the latest raw numeric value but cannot be trusted to
// identify its currency: the Store API only exposes the shop display currency.
// Reuse the verified per-product Railway decision and recompute the final price.
export const mergeRegisteredPriceIntoImport = (incoming = {}, existing = {}) => {
  const registry = existing.priceRegistry;
  if (!registry?.verified) return incoming;

  const rawPrice = money(incoming.sourcePrice ?? incoming.salePrice);
  const finalPrice = finalPriceFor(
    rawPrice,
    registry.rawCurrency,
    registry.finalCurrency,
    registry.exchangeRate,
  );
  if (rawPrice === null || finalPrice === null) return incoming;

  return applyPriceRegistry({ ...incoming }, {
    ...registry,
    rawPrice,
    finalPrice,
    evidence: {
      ...(registry.evidence || {}),
      lastWooRawPrice: rawPrice,
      lastWooImportAt: incoming.lastWooImportAt || null,
    },
  });
};
