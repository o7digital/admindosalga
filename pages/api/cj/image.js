import { getCjProductImage } from '@/services/cjdropshipping';
import { databaseIsAvailable, updateProductImage } from '@/lib/productRepository';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const productId = String(req.query.productId || '').trim();
  const productQuery = String(req.query.query || '').trim();
  if (!productId || !productQuery) {
    return res.status(400).json({ message: 'productId and query are required' });
  }

  try {
    const imageUrl = await getCjProductImage(productQuery);
    if (databaseIsAvailable()) await updateProductImage(productId, imageUrl);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.redirect(307, imageUrl);
  } catch (error) {
    console.error(`CJ image fallback failed for ${productId}:`, error.message);
    return res.status(404).json({ message: 'Product image unavailable' });
  }
}
