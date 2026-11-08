import { withAuth } from '@/lib/adminAuth';
import { getCjConnectionStatus } from '@/services/cjdropshipping';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const status = await getCjConnectionStatus({ verify: true });
    return res.status(200).json(status);
  } catch (error) {
    return res.status(200).json({
      configured: true,
      connected: false,
      mode: 'error',
      message: error.message || 'CJ connection failed',
    });
  }
}

export default withAuth(handler);
