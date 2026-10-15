import { createHash } from 'crypto';
import { query, withTransaction } from './db';
import { CJ_INTERVAL_MS } from './cjRequestQueue.mjs';

let schema;
const ensureSchema = () => {
  if (!schema) schema = withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(741982351)');
    await client.query(`CREATE TABLE IF NOT EXISTS cj_request_limits (
    account_key TEXT PRIMARY KEY,
    next_request_at TIMESTAMPTZ NOT NULL
  )`);
  }).catch(error => { schema = null; throw error; });
  return schema;
};

export async function reserveCjRequestSlot() {
  await ensureSchema();
  // Only a fingerprint is stored. All server instances sharing this CJ account
  // reserve slots in the same row, including Preview and Production.
  const accountKey = createHash('sha256').update(String(process.env.CJ_ACCESS_TOKEN || process.env.CJ_API_KEY || process.env.CJDROPSHIPPING_API_KEY || '')).digest('hex');
  const result = await query(`
    INSERT INTO cj_request_limits (account_key, next_request_at)
    VALUES ($1, clock_timestamp() + $2 * INTERVAL '1 millisecond')
    ON CONFLICT (account_key) DO UPDATE
      SET next_request_at = GREATEST(cj_request_limits.next_request_at, clock_timestamp())
        + $2 * INTERVAL '1 millisecond'
      WHERE cj_request_limits.next_request_at < clock_timestamp() + INTERVAL '20 seconds'
    RETURNING GREATEST(0, EXTRACT(EPOCH FROM (next_request_at - clock_timestamp())) * 1000 - $2) AS delay
  `, [accountKey, CJ_INTERVAL_MS]);
  const delay = result.rows.length ? Math.ceil(Number(result.rows[0].delay)) : Infinity;
  if (delay > 20000) {
    const error = new Error('CJ est occupé par une autre synchronisation. Réessayez dans quelques instants.');
    error.status = 429;
    throw error;
  }
  return delay;
}
