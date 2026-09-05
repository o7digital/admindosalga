const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL_NON_POOLING or DATABASE_URL is required.');
  process.exit(1);
}

const expectedTables = [
  'audit_logs', 'cj_cost_snapshots', 'cj_mappings', 'competitor_offers',
  'fx_rates', 'margin_snapshots', 'order_items', 'orders', 'product_variants',
  'products', 'shipping_quotes', 'store_listings', 'stores', 'sync_runs',
];

async function main() {
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = new Set(tablesResult.rows.map((row) => row.table_name));
    const missing = expectedTables.filter((table) => !tables.has(table));
    if (missing.length) throw new Error(`Missing tables: ${missing.join(', ')}`);

    const storesResult = await client.query(`
      SELECT code, name, currency_code, country_code, active
      FROM stores
      ORDER BY code
    `);
    if (storesResult.rowCount !== 2) {
      throw new Error(`Expected 2 stores, found ${storesResult.rowCount}`);
    }

    console.log(`database=ready domain_tables=${expectedTables.length}`);
    for (const store of storesResult.rows) {
      console.log(`store=${store.code} currency=${store.currency_code} active=${store.active}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Verification failed: ${error.message}`);
  process.exit(1);
});

