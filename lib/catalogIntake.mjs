// The storefront's WooCommerce snapshot contains new products before the public
// approval filter. Read that inbox, never the already filtered public catalogue.
export async function intakeCatalog({ query, mapProduct, saveProducts }) {
  let rows;
  try {
    ({ rows } = await query(`
      WITH catalog_rows AS MATERIALIZED (
        SELECT store_id, woo_id, payload, payload->>'sku' AS sku
        FROM storefront_catalog_products
        WHERE store_id IN ('MX', 'US') AND status = 'publish'
      )
      SELECT catalog.store_id, catalog.payload
      FROM catalog_rows catalog
      JOIN stores store ON store.code = catalog.store_id
      WHERE NOT EXISTS (
          SELECT 1 FROM store_listings listing
          WHERE listing.store_id = store.id AND listing.woo_product_id = catalog.woo_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM store_listings listing
          WHERE listing.external_id = 'wp-dosalga-' || CASE WHEN catalog.store_id = 'MX' THEN 'mexico' ELSE 'usa' END || '-' || catalog.woo_id::TEXT
        )
        AND (BTRIM(COALESCE(catalog.sku, '')) = '' OR NOT EXISTS (
          SELECT 1 FROM store_listings listing
          WHERE listing.store_id = store.id AND LOWER(listing.woo_sku) = LOWER(catalog.sku)
        ))
      ORDER BY catalog.woo_id
    `));
  } catch (error) {
    // Standalone admin installations may not share the storefront snapshot.
    if (error.code === '42P01') return { importedCount: 0, snapshotAvailable: false };
    throw error;
  }
  if (!rows.length) return { importedCount: 0, snapshotAvailable: true };
  const products = rows.map(({ payload, store_id = 'MX' }) => ({
    ...mapProduct(payload, store_id),
    status: 'review',
    shippingIncluded: null,
    minDeliveryDays: 0,
    maxDeliveryDays: 0,
    catalogIntake: { source: `woocommerce-${store_id.toLowerCase()}`, state: 'pending_review' },
  }));
  // Recheck identity inside the write transaction so concurrent refreshes do
  // not overwrite a price, approval, block or archive saved in the meantime.
  const saved = await saveProducts(products, { onlyMissing: true });
  return { importedCount: saved.length, snapshotAvailable: true };
}

export const intakeMexicanCatalog = intakeCatalog;
