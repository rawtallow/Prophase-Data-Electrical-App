import { NextResponse } from 'next/server';
import { verifyToken, COOKIE } from './lib/jwt';

// Paths reachable without a session.
const PUBLIC_PATHS = ['/login', '/setup', '/api/auth/login', '/api/setup'];

// Paths that require admin or manager (i.e. NOT a plain employee).
const FULL_ACCESS_PREFIXES = [
  '/quotes',
  '/payroll',
  '/backup',
  '/api/quotes',
  '/api/payroll',
  '/api/draws',
  '/api/employees',
  '/api/backup'
];

// Admin-only paths.
const ADMIN_ONLY_PREFIXES = ['/users', '/api/users'];

function isPublic(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
function matches(pathname, prefixes) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  if (matches(pathname, ADMIN_ONLY_PREFIXES) && session.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard?denied=1', req.url));
  }

  if (matches(pathname, FULL_ACCESS_PREFIXES) && session.role === 'employee') {
    return NextResponse.redirect(new URL('/dashboard?denied=1', req.url));
  }

  return NextResponse.next();
}

export const config = {
  // icon.svg is Next's App Router favicon convention (app/icon.svg) — without
  // this exclusion the middleware 307-redirects the unauthenticated favicon
  // request to /login, so the tab icon never loads until you're signed in.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)']
};
