// What every web route calls first: "who is this, and may they do this?". See check.ts for the rules.
// A route that does not call this (or an allowed alternative, see public-paths.ts) fails the structure test.
//
// Logging out really ends the session: the session id is "spent" in the database (the same table that makes Guardian approvals
// single-use), and every request checks that its session id has not been. To keep that cheap, a session that was checked
// within the last few seconds is not asked about again, so after Log out another server may accept the old cookie for up
// to that long.
import "server-only";
import { subkey } from "../guardian/secret";
import { getNonceStore } from "../ledger/server";
import { checkRequest } from "./check";

export type Authed = { ok: true; userId: string } | { ok: false; response: Response };

const noStore = { "Cache-Control": "no-store" };
const RECHECK_MS = 10_000;
const recentlyChecked = new Map<string, number>(); // session id -> when we last asked the database

const revokedKey = (sessionId: string) => `session:${sessionId}`;

export async function authenticate(req: Request): Promise<Authed> {
  try {
    const v = checkRequest(
      { method: req.method, url: req.url, headers: req.headers },
      { session: subkey("session"), csrf: subkey("csrf") },
      Date.now(),
      process.env.NORTH_SITE_URL,
    );
    if (!v.ok) return { ok: false, response: Response.json({ error: v.error }, { status: v.status, headers: noStore }) };

    const last = recentlyChecked.get(v.sessionId);
    if (last === undefined || Date.now() - last > RECHECK_MS) {
      if (await getNonceStore().isSpent(revokedKey(v.sessionId))) {
        recentlyChecked.delete(v.sessionId);
        return { ok: false, response: Response.json({ error: "Please log in." }, { status: 401, headers: noStore }) };
      }
      if (recentlyChecked.size > 2000) recentlyChecked.clear();
      recentlyChecked.set(v.sessionId, Date.now());
    }
    return { ok: true, userId: v.userId };
  } catch (e) {
    // For example, NORTH_SECRET is missing in production, or the database can't be reached. Never fall back to "let them in".
    console.error("[auth] could not check the login:", e instanceof Error ? e.message : e);
    return { ok: false, response: Response.json({ error: "Something is wrong on our side. Please try again later." }, { status: 503, headers: noStore }) };
  }
}

/** Log out for real: this session id stops working everywhere. */
export async function revokeSession(userId: string, sessionId: string, expiresAtMs: number): Promise<void> {
  recentlyChecked.delete(sessionId);
  await getNonceStore().consume(revokedKey(sessionId), userId, expiresAtMs);
}
