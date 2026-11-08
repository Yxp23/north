// Login sessions. After the password is checked (by Supabase Auth), the server issues its OWN signed cookie value:
// "this browser is user U, until T". It is an HMAC, so it can't be made or edited without the server's secret.
// Short life (hours). The CSRF token for a session is derived from its id with a different key.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 12 * 3_600_000;
const PREFIX = "s1";
const MAX_TOKEN = 800;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mac = (body: string, key: Buffer) => createHmac("sha256", key).update(`${PREFIX}.${body}`).digest();

export function issueSession(userId: string, nowMs: number, key: Buffer): { token: string; sessionId: string; expiresAt: number } {
  if (!UUID_RE.test(userId)) throw new Error("Not a user id.");
  const sessionId = randomBytes(16).toString("base64url");
  const expiresAt = nowMs + SESSION_TTL_MS;
  const body = Buffer.from(JSON.stringify({ v: 1, uid: userId, sid: sessionId, iat: nowMs, exp: expiresAt })).toString("base64url");
  return { token: `${PREFIX}.${body}.${mac(body, key).toString("base64url")}`, sessionId, expiresAt };
}

export type SessionResult = { ok: true; userId: string; sessionId: string; expiresAt: number } | { ok: false };

export function verifySession(token: unknown, key: Buffer, nowMs: number): SessionResult {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN) return { ok: false };
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false };
    const want = mac(parts[1], key);
    const got = Buffer.from(parts[2], "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false };
    const c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    if (c.v !== 1 || typeof c.uid !== "string" || !UUID_RE.test(c.uid)) return { ok: false };
    if (typeof c.sid !== "string" || c.sid.length < 8 || c.sid.length > 64) return { ok: false };
    if (typeof c.iat !== "number" || typeof c.exp !== "number" || !Number.isFinite(nowMs)) return { ok: false };
    if (nowMs >= c.exp || c.iat > nowMs + 5_000) return { ok: false };
    return { ok: true, userId: c.uid, sessionId: c.sid, expiresAt: c.exp };
  } catch {
    return { ok: false }; // fail closed
  }
}

/** The token the page must send back in the x-north-csrf header on every state-changing request. */
export const csrfFor = (sessionId: string, csrfKey: Buffer) => createHmac("sha256", csrfKey).update(`csrf:${sessionId}`).digest("base64url");

/** Constant-time compare of two strings. */
export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
