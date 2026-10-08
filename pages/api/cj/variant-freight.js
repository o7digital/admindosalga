import { databaseIsAvailable, listProducts, saveVariantFreight } from '@/lib/productRepository';
import { getCjFreightVariants, getLogistics } from '@/services/cjdropshipping';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL requis pour enregistrer les devis.' });
  try {
    const product = (await listProducts()).find(item => item.id === req.body?.productId);
    if (!product) return res.status(404).json({ message: 'Produit introuvable.' });
    let freight = product.variantFreight;
    if (req.body.action === 'start') {
      const variants = await getCjFreightVariants(product);
      if (!variants.length) throw new Error('CJ ne renvoie aucune variante.');
      freight = { variants, method: product.variantFreight?.method || '', origin: 'CN', destination: product.shippingDestination || (product.siteId === 'dosalga-usa' ? 'USA' : 'México'), capturedAt: new Date().toISOString() };
    } else if (req.body.action === 'quote') {
      if (!freight || freight.capturedAt !== req.body.capturedAt) return res.status(409).json({ message: 'Session de devis modifiée. Relancez la synchronisation.' });
      const variant = freight.variants.find(item => item.vid === req.body.vid);
      if (!variant) return res.status(400).json({ message: 'Variante inconnue.' });
      try {
        variant.routes = await getLogistics(variant, freight.destination);
        variant.error = variant.routes.length ? null : 'Aucune route disponible';
      } catch (error) { variant.routes = []; variant.error = error.message; }
      variant.quotedAt = new Date().toISOString();
      if (!freight.method) freight.method = variant.routes[0]?.method || '';
    } else if (req.body.action === 'method') {
      if (!freight?.variants.some(item => item.routes?.some(route => route.method === req.body.method))) return res.status(400).json({ message: 'Méthode inconnue.' });
      freight.method = req.body.method;
    } else return res.status(400).json({ message: 'Action inconnue.' });
    if (!await saveVariantFreight(product.id, freight)) throw new Error('Enregistrement du devis impossible.');
    res.status(200).json({ freight });
  } catch (error) { res.status(502).json({ message: error.message || 'Devis CJ indisponible.' }); }
}
