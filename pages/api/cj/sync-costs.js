import { syncCjProductCost } from '@/services/cjdropshipping';
import { databaseIsAvailable, listProducts, upsertProducts } from '@/lib/productRepository';

const MAX_BATCH_SIZE = 4;

const requestId = (product) => String(
  typeof product === 'string' ? product : product?.id || '',
).trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const requestedProducts = Array.isArray(req.body?.products)
    ? req.body.products
    : Array.isArray(req.body?.productIds) ? req.body.productIds : [];

  if (requestedProducts.length === 0) {
    return res.status(400).json({ message: 'At least one product is required for CJ cost sync.' });
  }

  if (requestedProducts.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ message: `CJ cost sync accepts up to ${MAX_BATCH_SIZE} products per batch.` });
  }

  let authoritativeById = null;
  if (databaseIsAvailable()) {
    authoritativeById = new Map((await listProducts()).map((product) => [product.id, product]));
  }

  const results = await Promise.allSettled(requestedProducts.map(async (requested) => {
    const id = requestId(requested);
    const product = authoritativeById ? authoritativeById.get(id) : requested;
    if (!product || typeof product !== 'object') {
      throw new Error(`Product ${id || '(missing id)'} was not found.`);
    }
    return syncCjProductCost(product);
  }));

  const products = [];
  const reports = results.map((result, index) => {
    const productId = requestId(requestedProducts[index]);
    if (result.status === 'fulfilled') {
      products.push(result.value.product);
      return {
        productId,
        changes: result.value.changes,
        mode: result.value.mode,
      };
    }

    return {
      productId,
      changes: [],
      mode: 'error',
      error: result.reason?.message || 'CJ cost sync failed',
    };
  });

  if (databaseIsAvailable() && products.length) {
    await upsertProducts(products);
  }

  return res.status(200).json({
    syncedAt: new Date().toISOString(),
    reports,
    products,
  });
}
