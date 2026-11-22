// The storefront's WooCommerce snapshot contains new products before the public
// approval filter. Read that inbox, never the already filtered public catalogue.
export async function intakeMexicanCatalog({ query, mapProduct, saveProducts }) {
  let rows;
  try {
    ({ rows } = await query(`
      SELECT catalog.payload
      FROM storefront_catalog_products catalog
      JOIN stores store ON store.code = catalog.store_id
      WHERE catalog.store_id = 'MX' AND catalog.status = 'publish'
        AND NOT EXISTS (
          SELECT 1 FROM store_listings listing
          WHERE listing.store_id = store.id
            AND (listing.woo_product_id = catalog.woo_id
              OR listing.external_id = 'wp-dosalga-mexico-' || catalog.woo_id::TEXT)
        )
      ORDER BY catalog.woo_id
    `));
  } catch (error) {
    // Standalone admin installations may not share the storefront snapshot.
    if (error.code === '42P01') return { importedCount: 0, snapshotAvailable: false };
    throw error;
  }
  if (!rows.length) return { importedCount: 0, snapshotAvailable: true };
  const products = rows.map(({ payload }) => ({
    ...mapProduct(payload),
    status: 'review',
    shippingIncluded: null,
    minDeliveryDays: 0,
    maxDeliveryDays: 0,
    catalogIntake: { source: 'woocommerce-mx', state: 'pending_review' },
  }));
  // Recheck identity inside the write transaction so concurrent refreshes do
  // not overwrite a price, approval, block or archive saved in the meantime.
  const saved = await saveProducts(products, { onlyMissing: true });
  return { importedCount: saved.length, snapshotAvailable: true };
}
