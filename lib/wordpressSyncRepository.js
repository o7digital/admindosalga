import { query } from '@/lib/db';

let schemaPromise;

const ensureSchema = () => {
  if (!schemaPromise) {
    schemaPromise = query(`
      CREATE TABLE IF NOT EXISTS wordpress_sync_runs (
        id BIGSERIAL PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
        trigger_name TEXT NOT NULL DEFAULT 'manual',
        imported_count INTEGER NOT NULL DEFAULT 0,
        reports JSONB NOT NULL DEFAULT '[]'::JSONB,
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS wordpress_sync_runs_started_idx
        ON wordpress_sync_runs (started_at DESC);
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
};

export const startWordPressSync = async (triggerName = 'manual') => {
  await ensureSchema();
  const result = await query(`
    INSERT INTO wordpress_sync_runs (status, trigger_name)
    VALUES ('running', $1) RETURNING id
  `, [triggerName]);
  return result.rows[0].id;
};

export const finishWordPressSync = async (id, { importedCount, reports }) => {
  await query(`
    UPDATE wordpress_sync_runs
    SET status = 'complete', imported_count = $2, reports = $3::JSONB,
        error_message = NULL, completed_at = NOW()
    WHERE id = $1
  `, [id, importedCount, JSON.stringify(reports || [])]);
};

export const failWordPressSync = async (id, error) => {
  if (!id) return;
  await query(`
    UPDATE wordpress_sync_runs
    SET status = 'failed', error_message = $2, completed_at = NOW()
    WHERE id = $1
  `, [id, String(error?.message || error).slice(0, 2000)]);
};

export const getWordPressSyncStatus = async () => {
  await ensureSchema();
  const result = await query(`
    SELECT id, status, trigger_name AS "triggerName", imported_count AS "importedCount",
           reports, error_message AS "errorMessage", started_at AS "startedAt",
           completed_at AS "completedAt"
    FROM wordpress_sync_runs ORDER BY started_at DESC LIMIT 1
  `);
  return result.rows[0] || null;
};
