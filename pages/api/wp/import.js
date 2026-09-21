import { importWordPressStores } from '@/services/wordpressStores';
import { databaseIsAvailable, upsertProducts } from '@/lib/productRepository';
import { failWordPressSync, finishWordPressSync, startWordPressSync } from '@/lib/wordpressSyncRepository';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let syncId = null;
  try {
    if (databaseIsAvailable()) syncId = await startWordPressSync(req.headers['x-sync-trigger'] || 'manual');
    const result = await importWordPressStores();
    if (databaseIsAvailable()) {
      await upsertProducts(result.products);
      await finishWordPressSync(syncId, { importedCount: result.products.length, reports: result.reports });
    }

    return res.status(200).json({
      importedAt: result.importedAt,
      reports: result.reports,
      importedCount: result.products.length,
      products: result.products,
      persisted: databaseIsAvailable(),
      syncId,
    });
  } catch (error) {
    try { await failWordPressSync(syncId, error); } catch (statusError) { console.error('WP sync status update failed:', statusError.message); }
    return res.status(500).json({ message: error.message || 'WordPress import failed' });
  }
}
