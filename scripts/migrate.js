const fs = require('fs/promises');
const path = require('path');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL_NON_POOLING or DATABASE_URL is required.');
  process.exit(1);
}

const ssl = connectionString.includes('localhost')
  ? undefined
  : { rejectUnauthorized: false };

async function main() {
  const client = new Client({ connectionString, ssl });
  const migrationsDirectory = path.join(process.cwd(), 'db', 'migrations');
  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of files) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename]
      );
      if (alreadyApplied.rowCount) {
        console.log(`skip ${filename}`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`applied ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
});

