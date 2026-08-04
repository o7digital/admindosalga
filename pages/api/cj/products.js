import { importCjProduct } from '@/services/cjdropshipping';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const result = await importCjProduct(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'CJ import failed' });
  }
}
