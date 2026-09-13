import { databaseIsAvailable, listProducts, beginCjPublication, finishCjPublication } from '@/lib/productRepository';
import { getCjShops, getCjShopProduct, saveCjShopVariants } from '@/services/cjdropshipping';
import { listingIdentity, selectShop, publicationVariants, allVariantsAccepted } from '@/lib/cjPublication.mjs';

export const config = { maxDuration: 60 };

// Read the public store using server-owned host and identifiers, never a browser URL.
async function wooProduct(identity) {
  const response = await fetch(`https://${identity.host}/wp-json/wc/store/v1/products/${identity.productId}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('WooCommerce product is unavailable or frozen. No publication can be verified.');
  return response.json();
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'Database required.' });
  let operation;
  let productId;
  let sent = false;
  try {
    productId = req.method === 'GET' ? req.query.productId : req.body?.productId;
    const product = (await listProducts()).find(p => p.id === productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    const identity = listingIdentity(product);
    const proposal = product.cjPriceProposal;
    if (!proposal) throw new Error('Save a price proposal first.');
    const shop = selectShop(await getCjShops(), identity);
    const detail = await getCjShopProduct(shop.id, identity.productId);
    let variants;
    try { variants = publicationVariants(detail, identity, proposal); }
    catch (error) {
      return res.status(409).json({ message: error.message, details: {
        shopCurrency: shop.currencyCode, productCurrency: detail?.platformProductPricesCurrency || null,
        variantCurrencies: [...new Set((detail?.variants || []).map(v => v.priceCurrency || null))],
        variantCount: detail?.variants?.length || 0,
      } });
    }
    const woo = await wooProduct(identity);
    if (woo.sku !== product.sku || woo.is_purchasable === false) throw new Error('WooCommerce SKU mismatch or product not purchasable.');
    if (req.method === 'GET') return res.status(200).json({ shop: shop.name, price: proposal.price, currency: proposal.currency, savedAt: proposal.savedAt, variants: variants.map(v => ({ id: v.id, sku: v.sku, title: v.title })), message: 'This price will apply to every listed variant. Shipping inclusion and ETA remain admin notes; this CJ endpoint changes only the price.' });
    if (req.body?.savedAt !== proposal.savedAt || req.body?.confirmAllVariants !== true) throw new Error('Review the current proposal and confirm all variants first.');
    operation = await beginCjPublication(productId, proposal.savedAt);
    if (!operation) return res.status(409).json({ message: 'Another publication is running or the proposal changed. Reload before retrying.' });
    sent = true;
    const cj = await saveCjShopVariants(shop.id, variants);
    const accepted = allVariantsAccepted(variants, cj.results);
    let state = accepted ? 'cj_accepted_woo_pending' : 'cj_partial_or_rejected';
    let message = accepted ? 'CJ accepted the prices. WooCommerce publication has not yet been verified.' : 'CJ did not confirm every variant. Review CJ before retrying.';
    let wooVerified = false;
    if (accepted) {
      try {
        const current = await wooProduct(identity);
        const prices = current.prices;
        // A range/variable product needs per-variant verification; never infer success from the lowest price.
        wooVerified = current.type === 'simple' && prices?.currency_code === proposal.currency
          && Number(prices.price) / (10 ** Number(prices.currency_minor_unit)) === proposal.price;
        if (wooVerified) { state = 'woo_verified'; message = 'CJ accepted the price and the current WooCommerce price matches.'; }
      } catch { /* Keep the explicit pending state. */ }
    }
    const publication = { state, message, at: new Date().toISOString(), proposalSavedAt: proposal.savedAt, price: proposal.price, currency: proposal.currency, shopId: shop.id, variantCount: variants.length, requestId: cj.requestId || null, wooVerified };
    await finishCjPublication(productId, operation, publication);
    return res.status(200).json({ publication });
  } catch (error) {
    if (operation) {
      await finishCjPublication(productId, operation, { state: sent ? 'unknown' : 'failed', message: sent ? 'CJ outcome could not be confirmed. Check CJ before retrying.' : error.message, at: new Date().toISOString() }).catch(() => {});
    }
    return res.status(502).json({ message: error.message || 'Publication failed. Verify CJ before retrying.' });
  }
}
