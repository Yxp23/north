import { authenticate, revokeSession } from "@/lib/auth/guard";
import { logoutCookies, readCookie, SESSION_COOKIE } from "@/lib/auth/cookies";
import { verifySession } from "@/lib/auth/session";
import { subkey } from "@/lib/guardian/secret";

// Logging out clears the cookies AND ends the session on the server: the old cookie stops working, even if someone copied it.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const s = verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE), subkey("session"), Date.now());
  if (s.ok) await revokeSession(s.userId, s.sessionId, s.expiresAt);
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const c of logoutCookies(process.env.NODE_ENV === "production")) headers.append("Set-Cookie", c);
  return Response.json({ ok: true }, { headers });
}
