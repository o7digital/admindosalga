import { databaseIsAvailable, listPriceRegistry } from '@/lib/productRepository';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL is required.' });

  try {
    const prices = await listPriceRegistry();
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json({ source: 'railway', prices });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Railway price registry is unavailable.' });
  }
}
