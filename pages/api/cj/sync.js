import { syncCjProduct } from '@/services/cjdropshipping';
import { databaseIsAvailable, upsertProducts } from '@/lib/productRepository';

const MAX_BATCH_SIZE = 4;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const requestedProducts = Array.isArray(req.body?.products) ? req.body.products : [];
  if (requestedProducts.length === 0) {
    return res.status(400).json({ message: 'At least one product is required for CJ sync.' });
  }

  if (requestedProducts.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ message: `CJ sync accepts up to ${MAX_BATCH_SIZE} products per batch.` });
  }

  const includeFreight = Boolean(req.body?.includeFreight);
  const results = await Promise.allSettled(
    requestedProducts.map((product) => syncCjProduct(product, { includeFreight }))
  );
  const products = [];
  const reports = results.map((result, index) => {
    const sourceProduct = requestedProducts[index];

    if (result.status === 'fulfilled') {
      products.push(result.value.product);
      return {
        productId: sourceProduct.id,
        changes: result.value.changes,
        mode: result.value.mode,
      };
    }

    return {
      productId: sourceProduct.id,
      changes: [],
      mode: 'error',
      error: result.reason?.message || 'CJ sync failed',
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
