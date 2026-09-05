import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

const createPool = () => {
  if (!connectionString) return null;

  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });
};

const globalForDatabase = globalThis;

export const db = globalForDatabase.dosalgaPool || createPool();

if (process.env.NODE_ENV !== 'production' && db) {
  globalForDatabase.dosalgaPool = db;
}

export const isDatabaseConfigured = () => Boolean(connectionString);

export const query = async (text, params = []) => {
  if (!db) throw new Error('DATABASE_URL is not configured.');
  return db.query(text, params);
};

export const withTransaction = async (callback) => {
  if (!db) throw new Error('DATABASE_URL is not configured.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

