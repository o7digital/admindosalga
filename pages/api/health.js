import { isDatabaseConfigured, query } from '@/lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      status: 'unavailable',
      database: { configured: false, connected: false },
    });
  }

  try {
    const result = await query(`
      SELECT
        NOW() AS checked_at,
        (SELECT COUNT(*)::INTEGER FROM stores WHERE active = TRUE) AS active_stores,
        (SELECT COUNT(*)::INTEGER FROM store_listings WHERE active = TRUE) AS active_listings
    `);
    return res.status(200).json({
      status: 'ok',
      database: {
        configured: true,
        connected: true,
        activeStores: result.rows[0].active_stores,
        activeListings: result.rows[0].active_listings,
        checkedAt: result.rows[0].checked_at,
      },
    });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    return res.status(503).json({
      status: 'unavailable',
      database: { configured: true, connected: false },
    });
  }
}
