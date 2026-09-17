import { databaseIsAvailable, listProducts, beginWooPricePublication, finishWooPricePublication } from '@/lib/productRepository';
import { listingIdentity } from '@/lib/cjPublication.mjs';
import { hasWooWriteCredentials, publishWooPrice, reviewWooPrice } from '@/services/woocommerce';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL is required.' });

  let operation;
  let productId;
  try {
    productId = req.method === 'GET' ? req.query.productId : req.body?.productId;
    const product = (await listProducts()).find(item => item.id === productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const identity = listingIdentity(product);
    const proposal = product.cjPriceProposal;
    if (!proposal) throw new Error('Save a price proposal first.');
    if (proposal.currency !== identity.currency) throw new Error(`Price currency must be ${identity.currency} for this WooCommerce store.`);
    if (!hasWooWriteCredentials(identity.market)) throw new Error(`WooCommerce ${identity.market} write credentials are missing.`);

    const review = await reviewWooPrice(identity, product.sku);
    if (req.method === 'GET') {
      return res.status(200).json({
        store: identity.host,
        price: proposal.price,
        currency: proposal.currency,
        savedAt: proposal.savedAt,
        variants: review.targets,
        message: 'This price will be written directly to WooCommerce. CJ will not be changed.',
      });
    }

    if (req.body?.savedAt !== proposal.savedAt || req.body?.confirmAllVariants !== true) {
      throw new Error('Review the current proposal and confirm all WooCommerce variations first.');
    }
    operation = await beginWooPricePublication(productId, proposal.savedAt);
    if (!operation) return res.status(409).json({ message: 'Another publication is running or this proposal was already published. Reload before retrying.' });

    const woo = await publishWooPrice(identity, proposal.price, product.sku);
    const verified = woo.updated.length > 0 && woo.updated.every(item => Number(item.price) === Number(proposal.price));
    if (!verified) throw new Error('WooCommerce did not confirm the new price on every product or variation.');

    const publication = {
      state: 'woo_verified',
      message: `WooCommerce updated and verified (${woo.updated.length} price${woo.updated.length === 1 ? '' : 's'}). CJ was not changed.`,
      at: new Date().toISOString(),
      proposalSavedAt: proposal.savedAt,
      previousPrice: Number(product.salePrice),
      price: proposal.price,
      currency: proposal.currency,
      wooVerified: true,
      wooUpdated: woo.updated.length,
    };
    await finishWooPricePublication(productId, operation, publication);
    return res.status(200).json({ publication });
  } catch (error) {
    if (operation) {
      await finishWooPricePublication(productId, operation, {
        state: 'failed', message: error.message, at: new Date().toISOString(), price: null,
      }).catch(() => {});
    }
    return res.status(502).json({ message: error.message || 'WooCommerce price publication failed.' });
  }
}
