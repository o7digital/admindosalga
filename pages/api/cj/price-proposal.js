import { databaseIsAvailable, saveCjPriceProposal } from '@/lib/productRepository';
import { validateCjPriceProposal } from '@/lib/cjPricing.mjs';

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ message: 'Method not allowed' });
  }
  const productId = typeof req.body?.productId === 'string' ? req.body.productId.trim() : '';
  if (!productId) return res.status(400).json({ message: 'Product listing is required.' });
  let proposal;
  try {
    proposal = validateCjPriceProposal(req.body);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL is required to save CJ price proposals.' });
  try {
    const saved = await saveCjPriceProposal(productId, proposal);
    if (!saved) return res.status(409).json({ message: 'Listing unavailable or currency changed. Reload the catalogue.' });
    return res.status(200).json({ proposal: saved });
  } catch (error) {
    console.error('CJ price proposal save failed:', error.message);
    return res.status(500).json({ message: 'Price proposal could not be saved. Please retry.' });
  }
}
