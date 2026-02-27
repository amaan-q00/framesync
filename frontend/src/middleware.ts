import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/register', '/api/auth', '/watch', '/auth/callback'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicRoute =
    pathname === '/' ||
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  const authToken = request.cookies.get('fs_token')?.value;

  if (!authToken && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (authToken && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$).*)'],
};
