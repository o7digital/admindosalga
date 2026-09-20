const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const confirmedLegacyUsdListings = new Set(['wp-dosalga-mexico-12711']);

export function convertSourcePrice(sourcePrice, sourceCurrency, saleCurrency, exchangeRate = 17.49) {
  const price = Number(sourcePrice);
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 17.49;
  if (!Number.isFinite(price) || price < 0) return 0;
  if (sourceCurrency === saleCurrency) return roundMoney(price);
  if (sourceCurrency === 'USD' && saleCurrency === 'MXN') return roundMoney(price * rate);
  if (sourceCurrency === 'MXN' && saleCurrency === 'USD') return roundMoney(price / rate);
  return roundMoney(price);
}

export function normalizeWooPrice(product) {
  const saleCurrency = product.saleCurrency || (product.siteId === 'dosalga-usa' ? 'USD' : 'MXN');

  if (product.priceNormalization === 'woo-mx-native-v2') return product;

  // Migrate the one historical listing that was explicitly confirmed as USD,
  // without applying that assumption to the rest of the MX catalogue.
  if (product.priceNormalization === 'woo-mx-usd-v1') {
    const sourcePrice = Number(product.sourceSalePriceUsd ?? product.salePrice);
    if (!Number.isFinite(sourcePrice) || sourcePrice < 0) return product;
    if (!confirmedLegacyUsdListings.has(String(product.id))) {
      const { sourceSalePriceUsd, ...rest } = product;
      return {
        ...rest,
        saleCurrency,
        sourceCurrency: 'MXN',
        sourcePrice,
        salePrice: sourcePrice,
        priceNormalization: 'woo-mx-native-v2',
      };
    }
    return {
      ...product,
      saleCurrency,
      sourceCurrency: 'USD',
      sourcePrice,
      sourceSalePriceUsd: sourcePrice,
      salePrice: convertSourcePrice(sourcePrice, 'USD', saleCurrency, product.exchangeRate),
      priceNormalization: 'explicit-source-currency-v1',
    };
  }

  // Before the source currency was stored explicitly, this single listing was
  // confirmed by the owner as a USD amount. Keep that migration path only for
  // this legacy record; new WordPress imports use prices.currency_code.
  if (!product.sourceCurrency && confirmedLegacyUsdListings.has(String(product.id)) && saleCurrency === 'MXN' && !product.priceNormalization) {
    const sourcePrice = Number(product.salePrice);
    if (Number.isFinite(sourcePrice) && sourcePrice >= 0) {
      return {
        ...product,
        saleCurrency,
        sourceCurrency: 'USD',
        sourcePrice,
        sourceSalePriceUsd: sourcePrice,
        salePrice: convertSourcePrice(sourcePrice, 'USD', saleCurrency, product.exchangeRate),
        priceNormalization: 'explicit-source-currency-v1',
      };
    }
  }

  const sourceCurrency = product.sourceCurrency || saleCurrency;
  const sourcePrice = Number(product.sourcePrice ?? product.salePrice);
  if (!Number.isFinite(sourcePrice) || sourcePrice < 0) return product;
  return {
    ...product,
    saleCurrency,
    sourceCurrency,
    sourcePrice,
    salePrice: convertSourcePrice(sourcePrice, sourceCurrency, saleCurrency, product.exchangeRate),
    priceNormalization: 'explicit-source-currency-v1',
  };
}
