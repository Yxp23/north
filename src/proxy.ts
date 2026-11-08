// Runs before every page and API request (Next.js "proxy", formerly middleware).
//  1. Security headers (CSP and friends) on every response; API responses are never cached.
//  2. A first gate: no valid login cookie means pages go to /login and /api answers 401. This is only the FIRST layer: every
//     route also checks the login itself (authenticate), and a test fails if one doesn't. Proxy is not an authorization system.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readCookie } from "@/lib/auth/cookies";
import { isPublicPath } from "@/lib/auth/public-paths";
import { verifySession } from "@/lib/auth/session";
import { subkey } from "@/lib/guardian/secret";
import { securityHeaders } from "@/lib/security/headers";

function loggedIn(req: NextRequest): boolean {
  try {
    return verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE), subkey("session"), Date.now()).ok;
  } catch {
    return false; // for example a missing secret in production: nobody is logged in
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const production = process.env.NODE_ENV === "production";
  const api = pathname.startsWith("/api/");

  let res: NextResponse;
  if (!isPublicPath(pathname) && !loggedIn(req)) {
    if (api) {
      res = NextResponse.json({ error: "Please log in." }, { status: 401 });
    } else {
      const to = req.nextUrl.clone();
      to.pathname = "/login";
      to.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
      res = NextResponse.redirect(to);
    }
  } else {
    res = NextResponse.next();
  }

  for (const [k, v] of Object.entries(securityHeaders({ production }))) res.headers.set(k, v);
  if (api) res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  // Everything except Next's own static files and pictures in /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
