import { databaseIsAvailable, listProducts } from '@/lib/productRepository';
import { listingIdentity } from '@/lib/cjPublication.mjs';
import { assignWooCategory } from '@/services/woocommerce';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL is required.' });
  try {
    const product = (await listProducts()).find(item => item.id === req.body?.productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    const result = await assignWooCategory(listingIdentity(product), req.body?.categorySlug);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(502).json({ message: error.message || 'WooCommerce category update failed.' });
  }
}
