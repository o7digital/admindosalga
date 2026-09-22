import { databaseIsAvailable, listProducts } from '@/lib/productRepository';
import { listingIdentity } from '@/lib/cjPublication.mjs';
import { hasWooWriteCredentials, reconcileWooProductCurrencies } from '@/services/woocommerce';

export const config = { maxDuration: 60 };

const maxListings = 25;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!databaseIsAvailable()) return res.status(503).json({ message: 'PostgreSQL is required.' });

  const requestedIds = Array.isArray(req.body?.productIds)
    ? req.body.productIds.map(value => String(value || '').trim())
    : [];
  if (!requestedIds.length || requestedIds.some(id => !id)) {
    return res.status(400).json({ message: 'Provide an explicit list of Railway productIds to reconcile.' });
  }
  if (requestedIds.length > maxListings) {
    return res.status(400).json({ message: `Currency reconciliation is limited to ${maxListings} listings per request.` });
  }
  if (new Set(requestedIds).size !== requestedIds.length) {
    return res.status(400).json({ message: 'Railway productIds must be unique.' });
  }

  try {
    const products = await listProducts();
    const byId = new Map(products.map(product => [product.id, product]));
    const missing = requestedIds.filter(id => !byId.has(id));
    if (missing.length) return res.status(404).json({ message: `Railway listings not found: ${missing.join(', ')}` });

    const listings = requestedIds.map(id => {
      const product = byId.get(id);
      const identity = listingIdentity(product);
      const sourceCurrency = String(product.sourceCurrency || '').trim().toUpperCase();
      const displayCurrency = String(product.saleCurrency || '').trim().toUpperCase();
      const exchangeRate = Number(product.exchangeRate);
      if (!/^[A-Z]{3}$/.test(sourceCurrency) || !/^[A-Z]{3}$/.test(displayCurrency) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new Error(`Railway currency data is incomplete for ${id}. No WooCommerce metadata was changed.`);
      }
      if (displayCurrency !== identity.currency) {
        throw new Error(`Railway display currency for ${id} must be ${identity.currency}. No WooCommerce metadata was changed.`);
      }
      return { identity, sourceCurrency, displayCurrency, exchangeRate, expectedSku: product.sku };
    });

    const markets = [...new Set(listings.map(listing => listing.identity.market))];
    const missingCredentials = markets.filter(market => !hasWooWriteCredentials(market));
    if (missingCredentials.length) {
      return res.status(503).json({ message: `WooCommerce write credentials are missing for: ${missingCredentials.join(', ')}.` });
    }

    const result = await reconcileWooProductCurrencies(listings, { maxListings });
    return res.status(200).json({
      ...result,
      message: `Verified ${result.requestedCount} explicit Railway listings; repaired ${result.repairedCount} WooCommerce currency metadata records. Product amounts were not changed.`,
    });
  } catch (error) {
    console.error('WooCommerce currency reconciliation failed:', error.message);
    return res.status(502).json({ message: error.message || 'WooCommerce currency reconciliation failed.' });
  }
}
