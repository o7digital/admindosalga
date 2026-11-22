import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isClerkConfigured } from './lib/auth.mjs';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);
const unauthorized = (status, message) => NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'private, no-store' } });

const clerk = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return NextResponse.next();
  const { userId } = await auth();
  if (userId) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) return unauthorized(401, 'Veuillez vous connecter.');
  const url = new URL('/sign-in', request.url);
  url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}, { signInUrl: '/sign-in', signUpUrl: '/sign-up' });

export default function middleware(request, event) {
  // The scheduler authenticates with its own secret inside this exact handler.
  if (request.nextUrl.pathname === '/api/catalog/sync' && request.method === 'GET') return NextResponse.next();
  if (isClerkConfigured()) return clerk(request, event);
  if (isPublicRoute(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) return unauthorized(503, 'Connexion temporairement indisponible.');
  return NextResponse.redirect(new URL('/sign-in?unavailable=1', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
