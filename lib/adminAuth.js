import { buildClerkProps, clerkClient, getAuth } from '@clerk/nextjs/server';
import { adminUser, createAuthGuard, isClerkConfigured } from '@/lib/auth.mjs';
import { safeRedirect } from '@/lib/authRedirect.mjs';

export { publicUser } from '@/lib/auth.mjs';

export async function getSession(req) {
  if (!isClerkConfigured()) throw new Error('Clerk is not configured.');
  const { userId } = getAuth(req);
  if (!userId) return null;
  const client = await clerkClient();
  return adminUser(await client.users.getUser(userId));
}

export const withAuth = createAuthGuard(getSession);

export async function authenticatedPage({ req, res }, { adminOnly = true } = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const user = await getSession(req);
    if (!user) return { redirect: { destination: '/sign-in', permanent: false } };
    if (adminOnly && !user.authorized) return { redirect: { destination: '/access-denied', permanent: false } };
    return { props: { ...buildClerkProps(req), user } };
  } catch {
    return { redirect: { destination: '/sign-in?unavailable=1', permanent: false } };
  }
}

export async function authenticationPage({ req, res, query }) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isClerkConfigured()) {
    res.statusCode = 503;
    return { props: { configured: false } };
  }
  try {
    const user = await getSession(req);
    if (user) {
      return { redirect: { destination: user.authorized ? safeRedirect(query.next) : '/access-denied', permanent: false } };
    }
    return { props: { ...buildClerkProps(req), configured: true } };
  } catch {
    res.statusCode = 503;
    return { props: { configured: true, unavailable: true } };
  }
}
