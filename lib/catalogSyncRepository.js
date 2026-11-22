import { query, withTransaction } from '@/lib/db';
import { upsertProducts } from '@/lib/productRepository';
import { sourceChanges } from '@/lib/catalogSource.mjs';

export async function catalogSyncStatus() {
  const { rows } = await query(`SELECT source, status, next_page AS "nextPage",
    imported_count AS "importedCount", updated_count AS "updatedCount",
    checked_at AS "checkedAt", succeeded_at AS "succeededAt", error_message AS message
    FROM catalog_sync_status WHERE source <> 'pipeline' ORDER BY source`);
  return rows;
}

export async function acquireCatalogSync() {
  const result = await query(`INSERT INTO catalog_sync_status (source, status, lease_until)
    VALUES ('pipeline', 'running', NOW() + INTERVAL '6 minutes')
    ON CONFLICT (source) DO UPDATE SET status = 'running', lease_until = EXCLUDED.lease_until
    WHERE catalog_sync_status.lease_until IS NULL OR catalog_sync_status.lease_until < NOW()
    RETURNING source`);
  return result.rowCount > 0;
}

export const releaseCatalogSync = () => query("UPDATE catalog_sync_status SET status='complete', lease_until=NULL, checked_at=NOW() WHERE source='pipeline'");

export async function startCatalogSource(source) {
  const { rows } = await query(`INSERT INTO catalog_sync_status (source, status, started_at)
    VALUES ($1, 'running', NOW()) ON CONFLICT (source) DO UPDATE SET status='running', started_at=NOW()
    RETURNING next_page`, [source]);
  return rows[0].next_page;
}

export const checkpointCatalogSource = (source, page) => query('UPDATE catalog_sync_status SET next_page=$2, checked_at=NOW() WHERE source=$1', [source, page]);

export const finishCatalogSource = (source, status, { importedCount = 0, updatedCount = 0, message = null } = {}) => query(`
  UPDATE catalog_sync_status SET status=$2, imported_count=$3, updated_count=$4,
    error_message=$5, checked_at=NOW(),
    succeeded_at=CASE WHEN $2='complete' THEN NOW() ELSE succeeded_at END,
    next_page=CASE WHEN $2='complete' THEN 1 ELSE next_page END
  WHERE source=$1`, [source, status, importedCount, updatedCount, message]);

// Existing retail prices, currencies, shipping decisions, approvals, blocks and
// archive flags are deliberately outside this source-data update statement.
export async function saveCatalogSourceProducts(products, source, market) {
  if (!products.length) return { importedCount: 0, updatedCount: 0 };
  const inserted = await upsertProducts(products, { onlyMissing: true });
  return withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dosalga-product-import'))");
    const { rows } = await client.query(`SELECT l.* FROM store_listings l JOIN stores s ON s.id=l.store_id
      WHERE s.code=$1 AND (l.external_id=ANY($2::TEXT[]) OR LOWER(l.woo_sku)=ANY($3::TEXT[]))
      FOR UPDATE OF l`, [market, products.map(p => p.id), products.map(p => String(p.sku).toLowerCase())]);
    const updates = [];
    let updatedCount = 0;
    for (const product of products) {
      const matches = rows.filter(row => row.external_id === product.id);
      const candidates = matches.length ? matches : rows.filter(row => row.woo_sku?.toLowerCase() === String(product.sku).toLowerCase());
      if (candidates.length !== 1) throw new Error(`Ambiguous ${market} product identity for ${product.sku}.`);
      const row = candidates[0];
      const previous = row.metadata.catalogSources?.[source];
      const current = product.catalogSourceSnapshot;
      const wooId = /^wp-dosalga-(?:mexico|usa)-(\d+)$/.exec(product.id)?.[1];
      const adoptWooListing = wooId && !row.woo_product_id;
      if (previous?.revision === current.revision && !adoptWooListing) continue;
      const changes = sourceChanges(previous, current, row);
      if (changes.length) updatedCount++;
      const patch = {
        catalogSources: { ...row.metadata.catalogSources, [source]: {
          ...current, receivedAt: new Date().toISOString(), changedFields: changes,
        } },
        pendingSourceChanges: row.metadata.pendingSourceChanges === true || changes.length > 0,
      };
      if (source === 'cj-my-products') Object.assign(patch, {
        pid: product.pid, cjSku: product.cjSku, cjProductUrl: product.cjProductUrl,
        cjCatalogCostUsd: product.cjCatalogCostUsd,
      });
      if (adoptWooListing) {
        patch.id = product.id;
        patch.productUrl = product.productUrl;
        patch.catalogIntake = { ...row.metadata.catalogIntake, needsWooListing: false };
        if (row.metadata.marketImport) patch.marketImport = { ...row.metadata.marketImport, wooLinked: true };
      }
      updates.push({ id: row.id, external_id: adoptWooListing ? product.id : row.external_id,
        woo_id: adoptWooListing ? Number(wooId) : null, product_url: adoptWooListing ? product.productUrl : null,
        sku: source.startsWith('woocommerce-') ? product.sku : null,
        stock: source.startsWith('woocommerce-') && row.active && !row.metadata.wooFrozen ? current.data.stock : null,
        patch });
    }
    if (updates.length) await client.query(`UPDATE store_listings l SET
      external_id=changes.external_id, woo_product_id=COALESCE(changes.woo_id,l.woo_product_id),
      product_url=COALESCE(changes.product_url,l.product_url),
      woo_sku=COALESCE(changes.sku,l.woo_sku),
      woo_stock_quantity=COALESCE(changes.stock,l.woo_stock_quantity),
      metadata=l.metadata || changes.patch, updated_at=NOW()
      FROM jsonb_to_recordset($1::JSONB) AS changes(id UUID, external_id TEXT, woo_id BIGINT, sku TEXT,
        product_url TEXT, stock NUMERIC, patch JSONB) WHERE l.id=changes.id`, [JSON.stringify(updates)]);
    return { importedCount: inserted.length, updatedCount };
  });
}
