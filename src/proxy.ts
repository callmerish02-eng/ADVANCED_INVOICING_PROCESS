/**
 * Next.js proxy (formerly middleware) — runs on every request.
 *
 * - Always allows /api/auth/login, /api/auth/logout, /api/health,
 *   and static assets.
 * - For everything else under /api/* and /, requires a valid session cookie.
 * - Returns 401 with a JSON body for API routes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/security/jwt';

const PUBLIC_API = ['/api/auth/login', '/api/auth/logout', '/api/health'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public API endpoints
  if (PUBLIC_API.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Only protect /api/* routes (the single visible page handles its own
  // auth state by calling /api/auth/me).
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySession(token) : null;

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'NO_SESSION' },
      { status: 401 },
    );
  }

  // Add CSRF-lite protection for mutating API routes
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    // Allow same-origin requests; reject cross-site POSTs to mutating endpoints
    if (origin && host) {
      const originHost = origin.replace(/^https?:\/\//, '');
      if (originHost !== host) {
        return NextResponse.json(
          { error: 'Cross-origin requests are not allowed', code: 'CSRF_BLOCKED' },
          { status: 403 },
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
