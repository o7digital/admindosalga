import { getCjConnectionStatus } from '@/services/cjdropshipping';

export default async function handler(req, res) {
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
