export function listingIdentity(product) {
  const match = /^wp-dosalga-(mexico|usa)-(\d+)$/.exec(String(product.id));
  if (!match || product.archived) throw new Error('Only active WooCommerce listings can be sent to CJ.');
  const market = match[1] === 'mexico' ? 'MX' : 'US';
  return { productId: match[2], market, currency: market === 'MX' ? 'MXN' : 'USD', host: `wp-dosalga-${market.toLowerCase()}.o7digitalgroup.com` };
}

export function selectShop(shops, identity) {
  const matches = shops.filter(shop => {
    let host;
    try { host = new URL(String(shop.name).includes('://') ? shop.name : `https://${shop.name}`).hostname; } catch { return false; }
    return host === identity.host && String(shop.type).toLowerCase() === 'woocommerce' && Number(shop.status) === 1 && shop.currencyCode === identity.currency;
  });
  if (matches.length !== 1) throw new Error('An authorized CJ shop with the exact WooCommerce hostname and currency is required.');
  return matches[0];
}

export function publicationVariants(detail, identity, proposal) {
  if (!detail || String(detail.platformProductId) !== identity.productId) throw new Error('This WooCommerce product was not found in the selected CJ shop. Synchronize the shop in CJ first.');
  if (proposal.currency !== identity.currency) throw new Error(`Dashboard currency ${proposal.currency} does not match the ${identity.market} shop currency ${identity.currency}. No prices were sent.`);
  if (Number(detail.shopProductStatus) !== 1) throw new Error('This product is not on sale in CJ. Frozen products cannot be published.');
  if (!Array.isArray(detail.variants) || detail.variants.length === 0) throw new Error('CJ returned no store variants. Price publishing requires verified variant IDs.');
  const seen = new Set();
  return detail.variants.map(v => {
    if (String(v.platformProductId) !== identity.productId || !v.platformVariantId || seen.has(String(v.platformVariantId))
      || !v.platformVariantSku || !v.platformVariantTitle || !v.platformVariantImage) {
      throw new Error('CJ variant identity or currency is incomplete. No prices were sent.');
    }
    seen.add(String(v.platformVariantId));
    return { id: String(v.platformVariantId), productId: identity.productId, title: v.platformVariantTitle,
      sku: v.platformVariantSku, image: v.platformVariantImage, shopPrice: proposal.price, shopPriceCurrency: proposal.currency };
  });
}

export function allVariantsAccepted(variants, results) {
  return variants.every(v => results.some(r => String(r.id) === v.id && String(r.productId) === v.productId && r.saveSuccess === true));
}
