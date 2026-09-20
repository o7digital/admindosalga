import { hasWooWriteCredentials, repairWooCategoryCurrency } from '@/services/woocommerce';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const market = String(req.body?.market || 'MX').toUpperCase();
  const categorySlug = String(req.body?.categorySlug || 'caps').trim().toLowerCase();
  if (market !== 'MX') return res.status(400).json({ message: 'This repair is currently limited to the Dosalga México catalogue.' });
  if (!hasWooWriteCredentials(market)) return res.status(503).json({ message: `WooCommerce ${market} write credentials are missing.` });

  try {
    const result = await repairWooCategoryCurrency({
      market,
      categorySlug,
      sourceCurrency: 'MXN',
      displayCurrency: 'MXN',
      exchangeRate: 1,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('WooCommerce category currency repair failed:', error.message);
    return res.status(502).json({ message: error.message || 'WooCommerce category currency repair failed.' });
  }
}
