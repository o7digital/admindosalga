import { withAuth } from '@/lib/adminAuth';
import { getCjShops } from '@/services/cjdropshipping';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  try {
    return res.status(200).json({ shops: await getCjShops() });
  } catch (error) {
    return res.status(502).json({ message: error.message });
  }
}

export default withAuth(handler);
