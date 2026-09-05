import { databaseIsAvailable, saveCompetitorOffer } from '@/lib/productRepository';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL is required to save competitor prices.' });

  try {
    const externalId = String(req.body?.productId || '').trim();
    const competitorName = String(req.body?.competitorName || '').trim();
    const price = Number(req.body?.price);
    const shippingCost = Number(req.body?.shippingCost || 0);
    const shippingIncluded = req.body?.shippingIncluded !== false;
    if (!externalId || !['temu', 'amazon'].includes(competitorName.toLowerCase())) {
      return res.status(400).json({ message: 'Product and competitor are required.' });
    }
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(shippingCost) || shippingCost < 0) {
      return res.status(400).json({ message: 'Prices must be positive numbers.' });
    }

    const offer = await saveCompetitorOffer({
      externalId,
      competitorName,
      price,
      shippingCost,
      shippingIncluded,
      url: String(req.body?.url || '').trim(),
    });
    if (!offer) return res.status(404).json({ message: 'Product listing not found.' });
    return res.status(201).json({ offer });
  } catch (error) {
    console.error('Competitor price save failed:', error.message);
    return res.status(500).json({ message: error.message || 'Competitor price could not be saved.' });
  }
}
