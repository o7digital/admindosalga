import { hashPassword, passwordError, verifyPassword } from '@/lib/auth.mjs';
import { changePassword, rateLimit, setSessionCookie, withAuth } from '@/lib/adminAuth';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  }
  const { currentPassword, password } = req.body || {};
  const error = passwordError(password);
  if (error) return res.status(400).json({ message: error });
  if (typeof currentPassword !== 'string' || currentPassword.length > 128) return res.status(400).json({ message: 'Renseignez votre mot de passe actuel.' });
  if (currentPassword === password) return res.status(400).json({ message: 'Choisissez un mot de passe différent du mot de passe actuel.' });
  try {
    if (!await rateLimit(`password:${req.authUser.id}`, 8)) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ message: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }
    const token = await changePassword(req.authUser.id, currentPassword, await hashPassword(password), verifyPassword);
    if (!token) return res.status(400).json({ message: 'Mot de passe actuel incorrect.' });
    setSessionCookie(req, res, token);
    return res.status(200).json({ success: true });
  } catch {
    return res.status(503).json({ message: 'Modification indisponible. Réessayez dans quelques instants.' });
  }
}, { allowPasswordChange: true });
