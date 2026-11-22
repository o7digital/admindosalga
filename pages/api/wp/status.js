import { withAuth } from '@/lib/adminAuth';
import { databaseIsAvailable } from '@/lib/productRepository';
import { getWordPressSyncStatus } from '@/lib/wordpressSyncRepository';
import { catalogSyncStatus } from '@/lib/catalogSyncRepository';

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) {
    return res.status(503).json({ database: 'unavailable', message: 'Railway database is not configured.' });
  }

  try {
    return res.status(200).json({ database: 'connected', sync: await getWordPressSyncStatus(), automatic: await catalogSyncStatus() });
  } catch (error) {
    return res.status(500).json({ database: 'error', message: error.message });
  }
}

export default withAuth(handler);
