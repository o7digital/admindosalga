import { importWordPressStores } from '@/services/wordpressStores';
import { databaseIsAvailable, listProducts, upsertProducts } from '@/lib/productRepository';
import { mergeCjDataIntoWordPressProduct } from '@/lib/cjData.mjs';
import { mergeRegisteredPriceIntoImport } from '@/lib/priceRegistry.mjs';
import { failWordPressSync, finishWordPressSync, startWordPressSync } from '@/lib/wordpressSyncRepository';

const listingKey = (product) => `${product.siteId || ''}:${String(product.sku || '').trim().toLowerCase()}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let syncId = null;
  try {
    if (databaseIsAvailable()) syncId = await startWordPressSync(req.headers['x-sync-trigger'] || 'manual');
    const result = await importWordPressStores();
    let products = result.products;
    if (databaseIsAvailable()) {
      const existingProducts = await listProducts();
      const existingById = new Map(existingProducts.map((product) => [product.id, product]));
      const existingByListing = new Map(existingProducts.map((product) => [listingKey(product), product]));
      products = result.products.map((product) => {
        const existing = existingById.get(product.id) || existingByListing.get(listingKey(product));
        return mergeCjDataIntoWordPressProduct(
          mergeRegisteredPriceIntoImport(product, existing),
          existing,
        );
      });
      await upsertProducts(products);
      await finishWordPressSync(syncId, { importedCount: products.length, reports: result.reports });
    }

    return res.status(200).json({
      importedAt: result.importedAt,
      reports: result.reports,
      importedCount: products.length,
      products,
      persisted: databaseIsAvailable(),
      syncId,
    });
  } catch (error) {
    try { await failWordPressSync(syncId, error); } catch (statusError) { console.error('WP sync status update failed:', statusError.message); }
    return res.status(500).json({ message: error.message || 'WordPress import failed' });
  }
}
