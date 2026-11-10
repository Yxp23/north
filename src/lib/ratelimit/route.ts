// "Is this person doing this too often?" for routes. Persistent (see limiter.ts). Returns null if fine, or the 429 to send.
import "server-only";
import { getRateLimiter } from "../ledger/server";

import { RATE_LIMIT_MESSAGE } from "../ui/rate-limit";

export const TOO_MANY = RATE_LIMIT_MESSAGE;

/**
 * For the attacker and other test runs that set things up over and over: NORTH_DEV_RATE_MULTIPLIER=10 makes the per-person limits
 * ten times bigger. It is ignored in production, and never touches the limits on assistants, logins or wrong keys.
 */
export function limitScale(env: Record<string, string | undefined> = process.env): number {
  if (env.NODE_ENV === "production") return 1;
  const m = Number(env.NORTH_DEV_RATE_MULTIPLIER);
  return Number.isFinite(m) && m >= 1 && m <= 100 ? Math.floor(m) : 1;
}

export async function limited(userId: string, action: string, limit: number, windowSeconds: number, message = TOO_MANY): Promise<Response | null> {
  const ok = await getRateLimiter().allow(`u:${userId}:${action}`, limit * limitScale(), windowSeconds);
  return ok ? null : Response.json({ error: message }, { status: 429, headers: { "Retry-After": String(Math.min(windowSeconds, 3600)) } });
}
