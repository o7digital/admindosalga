import { importWordPressStores } from '@/services/wordpressStores';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const result = await importWordPressStores();

    return res.status(200).json({
      importedAt: result.importedAt,
      reports: result.reports,
      importedCount: result.products.length,
      products: result.products,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'WordPress import failed' });
  }
}
