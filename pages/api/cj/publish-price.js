import { databaseIsAvailable, listProducts, beginCjPublication, finishCjPublication, stageRailwayPricePublication } from '@/lib/productRepository';
import { getCjShops, getCjShopProduct, saveCjShopProduct, saveCjShopVariants } from '@/services/cjdropshipping';
import { hasWooWriteCredentials, publishWooPrice } from '@/services/woocommerce';
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
    if (product.saleCurrency !== proposal.currency) throw new Error('The saved Railway listing currency no longer matches this price proposal. Reload the catalogue.');
    if (req.method === 'POST' && !hasWooWriteCredentials(identity.market)) {
      throw new Error(`WooCommerce ${identity.market} write credentials are missing. Configure WOOCOMMERCE_${identity.market}_CONSUMER_KEY and WOOCOMMERCE_${identity.market}_CONSUMER_SECRET before publishing; no CJ write was attempted.`);
    }
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
    const wooCurrent = await wooProduct(identity);
    if ((wooCurrent.sku && wooCurrent.sku !== product.sku) || wooCurrent.is_purchasable === false) throw new Error('WooCommerce SKU mismatch or product not purchasable.');
    if (req.method === 'GET') return res.status(200).json({ shop: shop.name, price: proposal.price, currency: proposal.currency, savedAt: proposal.savedAt, variants: variants.map(v => ({ id: v.id, sku: v.sku, title: v.title })), message: 'This price will be written to the CJ product and every variant, then to WooCommerce. Shipping inclusion and ETA remain admin notes.' });
    if (req.body?.savedAt !== proposal.savedAt || req.body?.confirmAllVariants !== true) throw new Error('Review the current proposal and confirm all variants first.');
    operation = await beginCjPublication(productId, proposal.savedAt);
    if (!operation) return res.status(409).json({ message: 'Another publication is running or the proposal changed. Reload before retrying.' });
    await stageRailwayPricePublication(productId, proposal, 'cj-and-woocommerce');
    const cjProduct = await saveCjShopProduct(shop.id, {
      id: identity.productId,
      title: detail.platformProductTitle || detail.title || product.name,
      image: detail.platformProductImage || detail.image || product.imageUrl,
      description: detail.platformProductDescription || detail.description || '',
      priceMin: proposal.price,
      priceMax: proposal.price,
      priceCurrency: proposal.currency,
    });
    if (!cjProduct.saved) throw new Error('CJ did not confirm the product price save. No variant prices were sent.');
    sent = true;
    const cj = await saveCjShopVariants(shop.id, variants);
    const accepted = allVariantsAccepted(variants, cj.results);
    let state = accepted ? 'cj_accepted' : 'cj_partial_or_rejected';
    let message = accepted ? 'CJ accepted the product and all variant prices.' : 'CJ did not confirm every variant. Review CJ before retrying.';
    let wooVerified = false;
    let wooResult = null;
    if (accepted) {
      wooResult = await publishWooPrice(identity, proposal.price, product.sku, {
        currency: product.saleCurrency,
        sourceCurrency: product.sourceCurrency,
        exchangeRate: product.exchangeRate,
      });
      wooVerified = wooResult.currencyVerified && wooResult.updated.length > 0 && wooResult.updated.every(item => Number(item.price) === Number(proposal.price));
      if (!wooVerified) throw new Error('WooCommerce did not confirm the new price on every product/variation.');
      state = 'woo_verified';
      message = `CJ and WooCommerce updated successfully (${wooResult.updated.length} price${wooResult.updated.length === 1 ? '' : 's'}).`;
    }
    const publication = { state, message, at: new Date().toISOString(), proposalSavedAt: proposal.savedAt, price: proposal.price, currency: proposal.currency, exchangeRate: product.exchangeRate, shopId: shop.id, variantCount: variants.length, requestId: cj.requestId || cjProduct.requestId || null, wooVerified, wooUpdated: wooResult?.updated?.length || 0 };
    await finishCjPublication(productId, operation, publication);
    return res.status(200).json({ publication });
  } catch (error) {
    if (operation) {
      await finishCjPublication(productId, operation, { state: sent ? 'unknown' : 'failed', message: sent ? 'CJ outcome could not be confirmed. Check CJ before retrying.' : error.message, at: new Date().toISOString() }).catch(() => {});
    }
    return res.status(502).json({ message: error.message || 'Publication failed. Verify CJ before retrying.' });
  }
}
