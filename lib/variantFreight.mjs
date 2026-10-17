export function variantFreightSummary(product) {
  const freight = product.variantFreight;
  if (!freight?.variants?.length) return null;
  const rows = freight.variants.map(variant => {
    const route = variant.routes?.find(route => route.method === freight.method);
    const confirmed = Number.isFinite(route?.shippingCost) && route.shippingCost >= 0 && variant.cjCostUsd > 0;
    return { ...variant, route, confirmed, landedUsd: confirmed ? variant.cjCostUsd + (product.shippingIncluded ? route.shippingCost : 0) : null };
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
    const maximum = method => Math.max(...freight.variants.map(variant => variant.routes.find(route => route.method === method).shippingCost));
    return maximum(a) - maximum(b);
  })[0] || freight.method || '';
}
