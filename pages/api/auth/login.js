import { withTransaction } from '@/lib/db';
import { normalizeEmail, verifyPassword, hashPassword } from '@/lib/auth.mjs';
import { createSession, publicUser, rateLimit, sameOrigin, setSessionCookie } from '@/lib/adminAuth';

let dummyHash;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ message: 'Origine de la requête non autorisée.' });
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || typeof password !== 'string' || !password || password.length > 128) {
    return res.status(400).json({ message: 'Renseignez votre email et votre mot de passe.' });
  }
  try {
    const ip = (process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] : req.socket.remoteAddress) || 'unknown';
    const ipAllowed = await rateLimit(`login:ip:${ip}`, 40);
    if (!ipAllowed || !await rateLimit(`login:email:${email}`, 8)) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ message: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }
    dummyHash ||= hashPassword('unused-dummy-password-for-timing');
    const session = await withTransaction(async (client) => {
      // Serialize login with password resets so an old password cannot create a
      // fresh session after a concurrent password change has revoked sessions.
      const result = await client.query('SELECT * FROM admin_users WHERE email = $1 FOR UPDATE', [email]);
      const user = result.rows[0];
      const valid = await verifyPassword(password, user?.password_hash || await dummyHash);
      if (!valid || !user?.active || (user.password_expires_at && new Date(user.password_expires_at) <= new Date())) return null;
      return { user, token: await createSession(user.id, client) };
    });
    if (!session) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect, ou accès expiré.' });
    }
    setSessionCookie(req, res, session.token);
    return res.status(200).json({ user: publicUser(session.user) });
  } catch (error) {
    console.error('Admin login unavailable:', error.code || 'database error');
    return res.status(503).json({ message: 'Connexion temporairement indisponible. Réessayez dans quelques instants.' });
  }
}
