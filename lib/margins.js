export const DEFAULT_EXCHANGE_RATES = {
  USD_MXN: 17.49,
  MXN_USD: 1 / 17.49,
};

export const currencyFormatters = {
  MXN: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }),
};

export const formatCurrency = (value, currency = 'MXN') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return currency === 'USD' ? '$0.00 USD' : '$0.00 MXN';

  return `${currencyFormatters[currency]?.format(numeric) || numeric.toFixed(2)} ${currency}`;
};

export const formatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.0%';

  return `${(numeric * 100).toFixed(1)}%`;
};

export const convertCurrency = (value, fromCurrency, toCurrency, rates = DEFAULT_EXCHANGE_RATES) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (fromCurrency === toCurrency) return numeric;

  const key = `${fromCurrency}_${toCurrency}`;
  const rate = Number(rates[key]);

  return Number.isFinite(rate) ? numeric * rate : numeric;
};

export const calculateProductMargin = (product, rates = DEFAULT_EXCHANGE_RATES) => {
  const saleCurrency = product.saleCurrency || 'MXN';
  const salePrice = Number(product.salePrice) || 0;
  const exchangeRate = Number(product.exchangeRate) || Number(rates.USD_MXN) || DEFAULT_EXCHANGE_RATES.USD_MXN;
  const productRates = {
    ...rates,
    USD_MXN: exchangeRate,
    MXN_USD: 1 / exchangeRate,
  };
  const cjCost = convertCurrency(
    Number(product.cjCostUsd ?? product.cjCost) || 0,
    product.cjCostUsd !== undefined ? 'USD' : product.cjCostCurrency || saleCurrency,
    saleCurrency,
    productRates
  );
  const shippingCost = product.shippingIncluded
    ? convertCurrency(
      Number(product.shippingUsd ?? product.shippingCost) || 0,
      product.shippingUsd !== undefined ? 'USD' : product.shippingCurrency || saleCurrency,
      saleCurrency,
      productRates
    )
    : 0;
  const platformFees = salePrice * (Number(product.platformFeeRate) || 0);
  const taxes = salePrice * (Number(product.taxRate) || 0);
  const landedCost = cjCost + shippingCost;
  const totalCost = landedCost + platformFees + taxes;
  const profit = salePrice - totalCost;
  const marginRate = salePrice > 0 ? profit / salePrice : 0;
  const markupRate = landedCost > 0 ? profit / landedCost : 0;

  return {
    saleCurrency,
    salePrice,
    exchangeRate,
    cjCostUsd: convertCurrency(cjCost, saleCurrency, 'USD', productRates),
    shippingUsd: convertCurrency(shippingCost, saleCurrency, 'USD', productRates),
    cjCost,
    shippingCost,
    platformFees,
    taxes,
    landedCost,
    totalCost,
    profit,
    marginRate,
    markupRate,
  };
};
