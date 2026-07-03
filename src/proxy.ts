import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 renamed middleware -> proxy. This is an OPTIMISTIC redirect only (its docs
// say proxy must not be the authorization solution): unauthenticated requests to
// protected paths bounce to /login. The real check is requireAdmin() in server code.
// The cookie name is inlined (not imported from auth.ts) to keep node-only deps —
// bcryptjs, node:crypto — out of the edge runtime.
const SESSION_COOKIE = "sutazmail_session";

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health");

  if (isPublic) return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Exclude /api so route handlers self-authenticate (requireAdmin) and are not
  // body-buffered by the proxy.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
