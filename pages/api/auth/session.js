import { publicUser, withAuth } from '@/lib/adminAuth';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  }
  return res.status(200).json({ user: publicUser(req.authUser) });
}, { allowPasswordChange: true });
