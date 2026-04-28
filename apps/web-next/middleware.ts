import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

const PROTECTED_PREFIXES = ['/dashboard', '/students', '/classes', '/attendance', '/grades', '/finance', '/messaging', '/lesson-homework'];
const AUTH_PAGES = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on everything except: _next/static, _next/image, favicon, and api proxy
     * (api/v1 already requires its own cookie via apps/web).
     */
    '/((?!_next/static|_next/image|favicon.ico|api/v1|healthz).*)'
  ]
};
