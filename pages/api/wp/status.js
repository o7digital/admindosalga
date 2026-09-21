import { databaseIsAvailable } from '@/lib/productRepository';
import { getWordPressSyncStatus } from '@/lib/wordpressSyncRepository';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) {
    return res.status(503).json({ database: 'unavailable', message: 'Railway database is not configured.' });
  }

  try {
    return res.status(200).json({ database: 'connected', sync: await getWordPressSyncStatus() });
  } catch (error) {
    return res.status(500).json({ database: 'error', message: error.message });
  }
}
