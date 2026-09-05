import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/api/health']);

const protectedMiddleware = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect();
});

export default clerkConfigured ? protectedMiddleware : function middleware() {
  return NextResponse.next();
};

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
