// The decision "may this request act as a logged-in user?", as a pure function so every rule can be tested.
//   1. A valid, unexpired session cookie.
//   2. For anything that changes state (not GET/HEAD/OPTIONS): the request must come from North's own pages:
//        - an Origin header that is North's own address, or (when the browser sends none) Sec-Fetch-Site same-origin/none, AND
//        - the CSRF header must equal the token worked out from this session.
//      A request that fails either is refused (403). Both must pass: SameSite cookies alone are not trusted.
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, readCookie } from "./cookies";
import { csrfFor, safeEqual, verifySession } from "./session";

export type HeaderBag = { get(name: string): string | null };
export type Facts = { method: string; url: string; headers: HeaderBag };
export type Keys = { session: Buffer; csrf: Buffer };

export type Verdict =
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; status: 401 | 403; code: "no_session" | "bad_origin" | "bad_csrf"; error: string };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const isStateChanging = (method: string) => !SAFE_METHODS.has(method.toUpperCase());

/** The addresses North's own pages may send requests from. */
export function ownOrigins(url: string, siteUrl?: string): Set<string> {
  const set = new Set<string>();
  try { set.add(new URL(url).origin); } catch { /* an unreadable URL allows nothing */ }
  if (siteUrl) { try { set.add(new URL(siteUrl).origin); } catch { /* ignore */ } }
  return set;
}

export function sameOrigin(f: Facts, siteUrl?: string): boolean {
  const origin = f.headers.get("origin");
  if (origin !== null) return origin !== "null" && ownOrigins(f.url, siteUrl).has(origin);
  const site = f.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export function checkRequest(f: Facts, keys: Keys, nowMs: number, siteUrl?: string): Verdict {
  const s = verifySession(readCookie(f.headers.get("cookie"), SESSION_COOKIE), keys.session, nowMs);
  if (!s.ok) return { ok: false, status: 401, code: "no_session", error: "Please log in." };
  if (isStateChanging(f.method)) {
    if (!sameOrigin(f, siteUrl)) return { ok: false, status: 403, code: "bad_origin", error: "That request did not come from North." };
    if (!safeEqual(f.headers.get(CSRF_HEADER), csrfFor(s.sessionId, keys.csrf))) {
      return { ok: false, status: 403, code: "bad_csrf", error: "That request could not be checked. Please reload the page." };
    }
  }
  return { ok: true, userId: s.userId, sessionId: s.sessionId };
}

export { CSRF_COOKIE };
