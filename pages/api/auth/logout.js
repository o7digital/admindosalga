import { query } from '@/lib/db';
import { SESSION_COOKIE, tokenHash, validSessionToken } from '@/lib/auth.mjs';
import { sameOrigin, setSessionCookie } from '@/lib/adminAuth';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ message: 'Origine de la requête non autorisée.' });
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (validSessionToken(token)) await query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash(token)]);
    setSessionCookie(req, res, '');
    return res.status(200).json({ success: true });
  } catch {
    return res.status(503).json({ message: 'Déconnexion indisponible. Réessayez dans quelques instants.' });
  }
}
