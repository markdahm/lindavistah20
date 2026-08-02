import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  verifySessionToken,
  hasValidApiKey,
  missingAuthConfig,
} from '@/lib/auth';

// Everything is behind the login except the login page itself, the auth endpoints, and
// static assets. Reads are protected as well as writes — only Mark uses this app, so
// there is no reason to leave the billing history publicly readable.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/config'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const missing = missingAuthConfig({
    APP_PASSWORD: process.env.APP_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
  });

  // Fail closed, but say which variable is missing so a misconfigured deploy is
  // diagnosable rather than a silent lockout.
  if (missing.length > 0) {
    return deny(request, `Server auth is not configured: ${missing.join(', ')} not set.`, 503);
  }

  const apiKeyOk = hasValidApiKey(
    request.headers.get('x-api-key'),
    process.env.LV_API_SECRET
  );
  if (apiKeyOk) return NextResponse.next();

  const sessionOk = await verifySessionToken(
    process.env.SESSION_SECRET as string,
    request.cookies.get(SESSION_COOKIE)?.value
  );
  if (sessionOk) return NextResponse.next();

  return deny(request, 'Not signed in.', 401);
}

function deny(request: NextRequest, message: string, status: number) {
  // API callers get JSON they can act on; browsers get sent to the login page.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: message }, { status });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (request.nextUrl.pathname !== '/') {
    url.searchParams.set('next', request.nextUrl.pathname);
  }
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals and static files; everything else goes through the check.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json).*)'],
};
