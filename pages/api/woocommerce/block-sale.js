import { databaseIsAvailable, listProducts, saveWooFreezeState } from '@/lib/productRepository';
import { listingIdentity } from '@/lib/cjPublication.mjs';
import { freezeWooProduct, hasWooWriteCredentials } from '@/services/woocommerce';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'Database required.' });

  const productId = typeof req.body?.productId === 'string' ? req.body.productId.trim() : '';
  if (!productId) return res.status(400).json({ message: 'Product listing is required.' });

  try {
    const product = (await listProducts()).find((item) => item.id === productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const identity = listingIdentity(product);
    if (!hasWooWriteCredentials(identity.market)) {
      return res.status(503).json({ message: `WooCommerce ${identity.market} credentials are missing.` });
    }

    const woo = await freezeWooProduct(identity, product.sku);
    const freeze = await saveWooFreezeState(productId, woo);
    if (!freeze) return res.status(409).json({ message: 'The WooCommerce product was blocked, but the dashboard state could not be saved. Reload and retry.' });

    return res.status(200).json({
      blocked: true,
      productId,
      woo,
      freeze,
      message: woo.alreadyFrozen ? 'Product was already blocked in WooCommerce.' : 'Product blocked in WooCommerce.',
    });
  } catch (error) {
    console.error('WooCommerce block sale failed:', error.message);
    return res.status(502).json({ message: error.message || 'The product could not be blocked in WooCommerce.' });
  }
}
