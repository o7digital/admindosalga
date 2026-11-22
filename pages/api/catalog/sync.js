import { withAuth } from '@/lib/adminAuth';
import { cronAuthorized } from '@/lib/catalogSource.mjs';
import { synchronizeCatalogs } from '@/services/catalogSync';

export const config = { maxDuration: 300 };

async function run(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try { return res.status(200).json(await synchronizeCatalogs()); }
  catch (error) {
    console.error('Automatic catalogue sync failed:', error.message);
    return res.status(500).json({ message: 'Synchronisation indisponible. Consultez l’état de chaque source.' });
  }
}

const adminRun = withAuth(run);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'POST') return adminRun(req, res);
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  if (!cronAuthorized(req.headers.authorization, process.env.CRON_SECRET)) return res.status(401).json({ message: 'Unauthorized' });
  return run(req, res);
}
