// middleware.ts — section 6.2 session gate
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/auth/login'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has('whr_session');

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (hasSession && pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }
  if (!hasSession) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ statusCode: 401, error: 'Unauthorized', message: 'Sign in again.' }, { status: 401 });
    }
    if (pathname === '/auth/logout') return NextResponse.next();
    const url = new URL('/login', req.url);
    url.search = '';
    url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'] };
