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
