import { NextResponse } from 'next/server';

// Early navigation guard only. The dashboard and every API independently verify
// sessions against PostgreSQL, even if middleware is bypassed.
export default function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/') || pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (!/^[a-f0-9]{64}$/.test(request.cookies.get('dosalga_admin_session')?.value || '')) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ message: 'Veuillez vous connecter.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    const url = new URL('/sign-in', request.url);
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
