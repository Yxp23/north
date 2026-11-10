import { createHash } from "node:crypto";
import { loginCookies } from "@/lib/auth/cookies";
import { sameOrigin } from "@/lib/auth/check";
import { signIn } from "@/lib/auth/provider";
import { LOGIN_RATE_LIMIT_MESSAGE } from "@/lib/ui/rate-limit";
import { csrfFor, issueSession, SESSION_TTL_MS } from "@/lib/auth/session";
import { subkey } from "@/lib/guardian/secret";
import { getLedger, getRateLimiter } from "@/lib/ledger/server";

// Logging in. There is no session yet, so there is no CSRF token: instead the request must come from North's own page
// (same origin), and it is rate limited by address and by account, so passwords can't be guessed quickly.
// Every failure says the same thing, so this can't be used to find out which emails have accounts.
// People are created by the operator; North never offers sign-up.
const WRONG = "That email or password is not right.";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!sameOrigin({ method: req.method, url: req.url, headers: req.headers }, process.env.NORTH_SITE_URL)) {
    return Response.json({ error: "That request did not come from North." }, { status: 403, headers: noStore });
  }
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 254) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || password.length > 200 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return Response.json({ error: WRONG }, { status: 400, headers: noStore });
  }

  const limiter = getRateLimiter();
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
  const who = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32);
  const [okIp, okWho] = await Promise.all([limiter.allow(`login:ip:${ip}`, 30, 900), limiter.allow(`login:who:${who}:${ip}`, 8, 900)]);
  if (!okIp || !okWho) return Response.json({ error: LOGIN_RATE_LIMIT_MESSAGE }, { status: 429, headers: { ...noStore, "Retry-After": "300" } });

  const r = await signIn(email, password);
  if (!r.ok) {
    return Response.json({ error: r.reason === "unavailable" ? "Logging in is not available right now. Please try again later." : WRONG }, { status: r.reason === "unavailable" ? 503 : 401, headers: noStore });
  }

  try {
    await getLedger(r.userId).read(); // the first time, this makes the person's account with the starting money
    const now = Date.now();
    const s = issueSession(r.userId, now, subkey("session"));
    const headers = new Headers(noStore);
    for (const c of loginCookies(s.token, csrfFor(s.sessionId, subkey("csrf")), Math.floor(SESSION_TTL_MS / 1000), process.env.NODE_ENV === "production")) headers.append("Set-Cookie", c);
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    console.error("[auth] could not start a session:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Logging in is not available right now. Please try again later." }, { status: 503, headers: noStore });
  }
}
