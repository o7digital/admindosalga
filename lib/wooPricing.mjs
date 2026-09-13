// The MX catalogue stores USD amounts despite reporting MXN in the Store API.
// Keep an explicit marker so legacy records are converted exactly once.
export function normalizeWooPrice(product) {
  if (product.priceNormalization || !/^wp-dosalga-mexico-\d+$/.test(String(product.id))
    || product.saleCurrency !== 'MXN') return product;
  const priceUsd = Number(product.salePrice);
  const rate = Number(product.exchangeRate) > 0 ? Number(product.exchangeRate) : 17.49;
  if (!Number.isFinite(priceUsd) || priceUsd < 0) return product;
  return {
    ...product,
    salePrice: Math.round((priceUsd * rate + Number.EPSILON) * 100) / 100,
    exchangeRate: rate,
    sourceSalePriceUsd: priceUsd,
    priceNormalization: 'woo-mx-usd-v1',
  };
}
