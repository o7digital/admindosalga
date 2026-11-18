const ADMIN_EMAILS = new Set(['dosalga.fac@gmail.com', 'olivier.steineur@gmail.com']);

export const isClerkConfigured = () => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export function adminUser(clerkUser) {
  const primaryEmail = clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId);
  const email = primaryEmail?.emailAddress?.trim().toLowerCase() || '';
  return {
    id: clerkUser.id,
    email,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email || 'Compte Dosalga',
    authorized: !clerkUser.banned && primaryEmail?.verification?.status === 'verified' && ADMIN_EMAILS.has(email),
  };
}

export const publicUser = ({ id, email, name }) => ({ id, email, name });

export function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin);
    return origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol);
  } catch {
    return false;
  }
}

export function createAuthGuard(getSession) {
  return (handler) => async function authenticatedHandler(req, res) {
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
    if (!user.authorized) return res.status(403).json({ message: 'Ce compte n’est pas autorisé à accéder à l’administration.', code: 'ADMIN_ACCESS_REQUIRED' });
    req.authUser = user;
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) req.body.editor = user.email;
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'cache-control' ? 'private, no-store' : value);
    return handler(req, res);
  };
}
