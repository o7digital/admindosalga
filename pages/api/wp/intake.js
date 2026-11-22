import { withAuth } from '@/lib/adminAuth';
import { query } from '@/lib/db';
import { databaseIsAvailable, upsertProducts } from '@/lib/productRepository';
import { getPricingRules } from '@/lib/pricingRules';
import { intakeMexicanCatalog } from '@/lib/catalogIntake.mjs';
import { mapWooProduct, storeSources } from '@/services/wordpressStores';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL est nécessaire pour importer les nouveautés.' });
  try {
    const rules = await getPricingRules();
    const source = storeSources.find(store => store.id === 'dosalga-mexico');
    const result = await intakeMexicanCatalog({
      query,
      mapProduct: product => mapWooProduct(product, source, rules),
      saveProducts: upsertProducts,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Catalog intake failed:', error.message);
    return res.status(500).json({ message: 'Les nouveaux produits WooCommerce n’ont pas pu être importés. Réessayez.' });
  }
}

export default withAuth(handler);
