import { importCjProduct, searchCjProducts } from '@/services/cjdropshipping';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    if (req.body?.searchName) {
      const products = await searchCjProducts(req.body.searchName);
      return res.status(200).json({ products, mode: 'live' });
    }
    const result = await importCjProduct(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'CJ import failed' });
  }
}
