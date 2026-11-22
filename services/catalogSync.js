import { acquireCatalogSync, releaseCatalogSync, startCatalogSource, checkpointCatalogSource,
  finishCatalogSource, saveCatalogSourceProducts } from '@/lib/catalogSyncRepository';
import { syncCatalogSource } from '@/lib/catalogSyncRunner.mjs';
import { pendingCjProduct, sourceSnapshot, wooRestAsStoreProduct } from '@/lib/catalogSource.mjs';
import { getPricingRules } from '@/lib/pricingRules';
import { getWooCatalogPage } from '@/services/woocommerce';
import { getCjMyProductsPage } from '@/services/cjdropshipping';
import { mapWooProduct, storeSources } from '@/services/wordpressStores';

export async function synchronizeCatalogs() {
  if (!await acquireCatalogSync()) return { skipped: true, reason: 'already_running', sources: [] };
  try {
    const rules = await getPricingRules();
    const sources = [];
    const persistence = { start: startCatalogSource, checkpoint: checkpointCatalogSource, finish: finishCatalogSource };
    for (const market of ['MX', 'US']) {
      const source = `woocommerce-${market.toLowerCase()}`;
      const store = storeSources.find(s => s.id === (market === 'MX' ? 'dosalga-mexico' : 'dosalga-usa'));
      sources.push(await syncCatalogSource({ source, ...persistence,
        fetchPage: page => getWooCatalogPage(market, page),
        savePage: rawProducts => saveCatalogSourceProducts(rawProducts.map(raw => {
          const mapped = mapWooProduct(wooRestAsStoreProduct(raw, store.currency), store, rules);
          const product = { ...mapped, stock: raw.stock_quantity ?? 0, status: 'review', shippingIncluded: null, minDeliveryDays: 0, maxDeliveryDays: 0,
            catalogIntake: { source, state: 'pending_review' } };
          return { ...product, catalogSourceSnapshot: sourceSnapshot(product, source, raw) };
        }), source, market),
      }));
    }
    sources.push(await syncCatalogSource({ source: 'cj-my-products', ...persistence,
      fetchPage: getCjMyProductsPage,
      savePage: async rawProducts => {
        const total = { importedCount: 0, updatedCount: 0 };
        for (const market of ['MX', 'US']) {
          const products = rawProducts.map(raw => {
            const product = pendingCjProduct(raw, market);
            return { ...product, catalogSourceSnapshot: sourceSnapshot(product, 'cj-my-products', raw) };
          });
          const saved = await saveCatalogSourceProducts(products, 'cj-my-products', market);
          total.importedCount += saved.importedCount;
          total.updatedCount += saved.updatedCount;
        }
        return total;
      },
    }));
    return { skipped: false, sources };
  } finally {
    await releaseCatalogSync();
  }
}
