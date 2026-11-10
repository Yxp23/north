// Limits for the PUBLIC demo. In the judges' deployment everyone logs in as the same practice account, so the ordinary per-person limits
// (which are per account) would be shared by every visitor at once. Here each visitor (their own session, or their address if they have none)
// gets their own allowance for the calls that cost money (the AI helpers, and Channel3), and the whole demo has a daily cap, so a crowd or
// a script can't run up the bill. Outside the judges' deployment none of this applies.
import "server-only";
import { SESSION_COOKIE, readCookie } from "../auth/cookies";
import { verifySession } from "../auth/session";
import { isDemoDeployment } from "../demo/mode";
import { subkey } from "../guardian/secret";
import { getRateLimiter } from "../ledger/server";
import { RATE_LIMIT_MESSAGE } from "../ui/rate-limit";
import { limitScale } from "./route";
import type { RateLimiter } from "./limiter";

/** Calls that cost money. "ai" = a helper that calls the model. "stores" = a live Channel3 read. */
export type CostKind = "ai" | "stores";

export const DEMO_LIMITS = {
  /** Per visitor, per hour. */
  perVisitorPerHour: { ai: 60, stores: 120 },
  /** Whole demo, per day. */
  perDay: { ai: 1500, stores: 6000 },
} as const;

const addressOf = (req: Request) => (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);

/** Who is this visitor? Their own session if they have one (several judges can share one address), otherwise their address. */
export function visitorKey(req: Request): string {
  try {
    const s = verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE), subkey("session"), Date.now());
    if (s.ok) return `s:${s.sessionId}`;
  } catch {
    /* fall back to the address */
  }
  return `ip:${addressOf(req)}`;
}

/** The check itself, separate from the request so it can be tested. True = allowed. */
export async function demoAllowance(limiter: RateLimiter, visitor: string, kind: CostKind, scale = 1, perDay: number = DEMO_LIMITS.perDay[kind]): Promise<{ ok: true } | { ok: false; why: "visitor" | "day" }> {
  if (!(await limiter.allow(`demo:v:${visitor}:${kind}`, DEMO_LIMITS.perVisitorPerHour[kind] * scale, 3600))) return { ok: false, why: "visitor" };
  if (!(await limiter.allow(`demo:day:${kind}`, perDay * scale, 86_400))) return { ok: false, why: "day" };
  return { ok: true };
}

/** For routes that call the AI or Channel3: null if fine, or the calm 429 to send. Does nothing outside the judges' deployment. */
export async function demoCostLimit(req: Request, kind: CostKind): Promise<Response | null> {
  if (!isDemoDeployment()) return null;
  const envCap = Number(process.env[kind === "ai" ? "DEMO_AI_DAILY_LIMIT" : "DEMO_STORES_DAILY_LIMIT"]);
  const perDay = Number.isFinite(envCap) && envCap >= 1 ? Math.floor(envCap) : DEMO_LIMITS.perDay[kind];
  const r = await demoAllowance(getRateLimiter(), visitorKey(req), kind, limitScale(), perDay);
  return r.ok ? null : Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": r.why === "day" ? "3600" : "60" } });
}
