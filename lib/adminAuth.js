import { query, withTransaction } from '@/lib/db';
import { SESSION_COOKIE, SESSION_SECONDS, newSessionToken, tokenHash, validSessionToken, sessionCookie } from '@/lib/auth.mjs';

export const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name, mustChangePassword: user.must_change_password });

export async function getSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!validSessionToken(token)) return null;
  const result = await query(`
    SELECT u.id, u.email, u.name, u.must_change_password
    FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE
      AND (u.password_expires_at IS NULL OR u.password_expires_at > NOW())
  `, [tokenHash(token)]);
  return result.rows[0] || null;
}

export async function createSession(userId, client = { query }) {
  const token = newSessionToken();
  await client.query(`INSERT INTO admin_sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, NOW() + $3 * INTERVAL '1 second')`, [tokenHash(token), userId, SESSION_SECONDS]);
  return token;
}

export function setSessionCookie(req, res, token) {
  res.setHeader('Set-Cookie', sessionCookie(token, process.env.NODE_ENV === 'production', token ? SESSION_SECONDS : 0));
}

export function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    return origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol);
  } catch {
    return false;
  }
}

export async function rateLimit(bucket, limit) {
  const result = await query(`
    INSERT INTO admin_auth_attempts (bucket) VALUES ($1)
    ON CONFLICT (bucket) DO UPDATE SET
      attempts = CASE WHEN admin_auth_attempts.window_started_at < NOW() - INTERVAL '15 minutes'
        THEN 1 ELSE admin_auth_attempts.attempts + 1 END,
      window_started_at = CASE WHEN admin_auth_attempts.window_started_at < NOW() - INTERVAL '15 minutes'
        THEN NOW() ELSE admin_auth_attempts.window_started_at END
    RETURNING attempts
  `, [tokenHash(bucket)]);
  return result.rows[0].attempts <= limit;
}

export function withAuth(handler, { allowPasswordChange = false } = {}) {
  return async function authenticatedHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req)) {
      return res.status(403).json({ message: 'Origine de la requête non autorisée.' });
    }
    let user;
    try {
      user = await getSession(req);
    } catch {
      return res.status(503).json({ message: 'Connexion temporairement indisponible. Réessayez dans quelques instants.' });
    }
    if (!user) return res.status(401).json({ message: 'Veuillez vous connecter.' });
    if (user.must_change_password && !allowPasswordChange) {
      return res.status(403).json({ message: 'Changez votre mot de passe temporaire avant de continuer.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    req.authUser = user;
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) req.body.editor = user.email;
    // Keep authenticated responses out of shared CDN caches even when a handler
    // previously opted into public caching.
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'cache-control' ? 'private, no-store' : value);
    return handler(req, res);
  };
}

export async function changePassword(userId, currentPassword, passwordHash, verifyPassword) {
  return withTransaction(async (client) => {
    const result = await client.query('SELECT password_hash FROM admin_users WHERE id = $1 AND active = TRUE FOR UPDATE', [userId]);
    if (!result.rows[0] || !await verifyPassword(currentPassword, result.rows[0].password_hash)) return null;
    await client.query(`UPDATE admin_users SET password_hash = $2, must_change_password = FALSE,
      password_expires_at = NULL, updated_at = NOW() WHERE id = $1`, [userId, passwordHash]);
    await client.query('DELETE FROM admin_sessions WHERE user_id = $1', [userId]);
    return createSession(userId, client);
  });
}
