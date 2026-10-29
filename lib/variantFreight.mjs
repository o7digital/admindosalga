export const freightShippingTotal = route => route?.totalShippingCost ?? route?.shippingCost;

export function freightRouteAmounts(product, variant, route) {
  const shippingUsd = route?.shippingCost;
  const totalShippingUsd = freightShippingTotal(route);
  const confirmed = Number.isFinite(shippingUsd) && shippingUsd >= 0
    && Number.isFinite(totalShippingUsd) && totalShippingUsd >= shippingUsd && variant.cjCostUsd > 0;
  const exchangeRate = Number(product.exchangeRate);
  const validFx = Number.isFinite(exchangeRate) && exchangeRate > 0;
  return {
    confirmed, exchangeRate: validFx ? exchangeRate : null,
    shippingUsd: confirmed ? shippingUsd : null,
    shippingMxn: confirmed && validFx ? shippingUsd * exchangeRate : null,
    feesUsd: confirmed ? totalShippingUsd - shippingUsd : null,
    totalShippingUsd: confirmed ? totalShippingUsd : null,
    totalUsd: confirmed ? variant.cjCostUsd + totalShippingUsd : null,
    totalMxn: confirmed && validFx ? (variant.cjCostUsd + totalShippingUsd) * exchangeRate : null,
  };
}

export function selectFreightMethod(freight, method, vid) {
  const variants = vid ? freight?.variants?.filter(variant => variant.vid === vid) : freight?.variants;
  if (!variants?.length || !variants.some(variant => variant.routes?.some(route => route.method === method))) {
    throw new Error('Méthode indisponible pour cette variante.');
  }
  return { ...freight, ...(vid ? {} : { method }), variants: freight.variants.map(variant => {
    if (vid) return variant.vid === vid ? { ...variant, shippingMethod: method } : variant;
    const { shippingMethod, ...rest } = variant;
    return rest;
  }) };
}

export function variantFreightSummary(product) {
  const freight = product.variantFreight;
  if (!freight?.variants?.length) return null;
  const rows = freight.variants.map(variant => {
    const route = variant.routes?.find(route => route.method === (variant.shippingMethod || freight.method));
    const amounts = freightRouteAmounts(product, variant, route);
    return { ...variant, route, ...amounts, landedUsd: amounts.confirmed ? variant.cjCostUsd + (product.shippingIncluded ? amounts.totalShippingUsd : 0) : null };
  });
  const confirmed = rows.filter(row => row.confirmed);
  const worst = confirmed.reduce((previous, row) => !previous || row.landedUsd > previous.landedUsd ? row : previous, null);
  return { rows, worst, complete: confirmed.length === rows.length, confirmed: confirmed.length,
    min: confirmed.length ? Math.min(...confirmed.map(row => row.route.shippingCost)) : null,
    max: confirmed.length ? Math.max(...confirmed.map(row => row.route.shippingCost)) : null };
}


export function freightDeliveryRange(product) {
  const summary = variantFreightSummary(product);
  if (!summary?.complete) return null;
  const routes = summary.rows.map(row => row.route);
  if (routes.some(route => !(route.minDeliveryDays > 0) || route.maxDeliveryDays < route.minDeliveryDays)) return null;
  return { min: Math.min(...routes.map(route => route.minDeliveryDays)), max: Math.max(...routes.map(route => route.maxDeliveryDays)) };
}

export function commonFreightMethod(freight) {
  if (!freight?.variants?.length || freight.variants.some(variant => !variant.quotedAt)) return freight?.method || '';
  const methods = (freight.variants[0].routes || []).map(route => route.method).filter(method =>
    freight.variants.every(variant => variant.routes?.some(route => route.method === method)));
  if (methods.includes(freight.method)) return freight.method;
  return methods.sort((a, b) => {
    const maximum = method => Math.max(...freight.variants.map(variant => freightShippingTotal(variant.routes.find(route => route.method === method))));
    return maximum(a) - maximum(b);
  })[0] || freight.method || '';
}
