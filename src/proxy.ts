import { NextResponse, type NextRequest } from 'next/server';
import { getStorefrontEnabled } from '@/lib/server/system-config';

// Runs on every page request so a dashboard change applies immediately. Next
// always runs this proxy on the Node.js runtime, which is why the switch can be
// read from the system-config file.
//
// The API stays reachable on purpose: an external frontend consumes the same
// endpoints and must keep working while the built-in storefront is closed.
const publicPrefixes = ['/admin', '/api', '/_next', '/icons', '/favicon.ico'];

const staticFilePattern = /\.(?:svg|png|jpg|jpeg|webp|gif|ico|txt|xml|webmanifest|json|css|js|map)$/i;

function isAllowedPath(pathname: string) {
  return publicPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  ) || staticFilePattern.test(pathname);
}

export function proxy(request: NextRequest) {
  if (getStorefrontEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isAllowedPath(pathname)) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
