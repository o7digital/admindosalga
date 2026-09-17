const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

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
