// Source currency is confirmed per listing, never inferred from the amount.
// The owner confirmed this watch's Woo amount is USD; other MX prices keep
// the currency reported by WooCommerce until separately verified.
const confirmedUsdListings = new Set(['wp-dosalga-mexico-12711']);

export function normalizeWooPrice(product) {
  if (!/^wp-dosalga-mexico-\d+$/.test(String(product.id))
    || product.saleCurrency !== 'MXN') return product;
  const legacyConversion = product.priceNormalization === 'woo-mx-usd-v1';
  if (product.priceNormalization && !legacyConversion) return product;
  const sourcePrice = Number(legacyConversion ? product.sourceSalePriceUsd : product.salePrice);
  if (!Number.isFinite(sourcePrice) || sourcePrice < 0) return product;
  if (!confirmedUsdListings.has(product.id)) {
    if (!legacyConversion) return product;
    // Restore any persisted conversion from the earlier catalogue-wide rule.
    const { sourceSalePriceUsd, ...rest } = product;
    return { ...rest, salePrice: sourcePrice, priceNormalization: 'woo-mx-native-v2' };
  }
  const rate = Number(product.exchangeRate) > 0 ? Number(product.exchangeRate) : 17.49;
  return {
    ...product,
    salePrice: Math.round((sourcePrice * rate + Number.EPSILON) * 100) / 100,
    exchangeRate: rate,
    sourceSalePriceUsd: sourcePrice,
    priceNormalization: 'woo-mx-confirmed-usd-v2',
  };
}
