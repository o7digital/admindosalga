import { databaseIsAvailable, listProducts, upsertProducts } from '@/lib/productRepository';
import { convertSourcePrice } from '@/lib/wooPricing.mjs';

export const config = { maxDuration: 60 };

const getLatestRate = async () => {
  const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=MXN', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Le taux USD/MXN est indisponible.');
  const data = await response.json();
  const rate = Number(data.rates?.MXN);
  if (!(rate > 0)) throw new Error('Taux USD/MXN invalide.');
  return { rate, date: data.date, source: 'Frankfurter · BCE' };
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  try {
    if (req.method === 'GET') return res.status(200).json(await getLatestRate());
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
    if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL est requis pour valider le taux catalogue.' });
    const latest = await getLatestRate();
    if (Math.abs(Number(req.body?.rate) - latest.rate) > 0.0001) return res.status(409).json({ message: 'Le taux a changé. Rechargez la page.', latest });
    const products = await listProducts();
    const editor = String(req.body?.editor || 'System').slice(0, 120);
    const updated = products.map((product) => ({ ...product, exchangeRate: latest.rate,
      salePrice: convertSourcePrice(product.sourcePrice, product.sourceCurrency, product.saleCurrency, latest.rate),
      fxUpdatedAt: new Date().toISOString(), fxRateDate: latest.date, editor }));
    await upsertProducts(updated);
    return res.status(200).json({ ...latest, updated: updated.length, editor });
  } catch (error) {
    return res.status(502).json({ message: error.message || 'FX update failed.' });
  }
}
