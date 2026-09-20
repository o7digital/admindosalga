import { listPricingRules, upsertPricingRule } from '@/lib/pricingRules';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ rules: await listPricingRules() });
    }

    if (req.method === 'PUT') {
      return res.status(200).json({ rule: await upsertPricingRule(req.body || {}) });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    return res.status(error.message?.includes('DATABASE_URL') ? 503 : 400).json({ message: error.message || 'Pricing rule operation failed.' });
  }
}
