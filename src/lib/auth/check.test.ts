import { describe, expect, it } from "vitest";
import { checkRequest, isStateChanging, sameOrigin } from "./check";
import { CSRF_HEADER, SESSION_COOKIE } from "./cookies";
import { csrfFor, issueSession } from "./session";

const KEYS = { session: Buffer.from("s".repeat(32)), csrf: Buffer.from("c".repeat(32)) };
const NOW = 1_800_000_000_000;
const UID = "6b1f5b2e-9f43-4a2d-8b6e-0c9f1d2a3b4c";
const URL_ = "https://north.example/api/checkout";
const session = issueSession(UID, NOW, KEYS.session);
const csrf = csrfFor(session.sessionId, KEYS.csrf);
const headers = (h: Record<string, string | undefined>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const req = (method: string, h: Record<string, string | undefined> = {}) => ({
  method, url: URL_,
  headers: headers({ cookie: `${SESSION_COOKIE}=${session.token}`, origin: "https://north.example", [CSRF_HEADER]: csrf, ...h }),
});

describe("a request needs a login", () => {
  it("no cookie: 401", () => {
    expect(checkRequest({ method: "GET", url: URL_, headers: headers({}) }, KEYS, NOW)).toMatchObject({ ok: false, status: 401 });
  });
  it("a made-up, edited or expired cookie: 401", () => {
    for (const cookie of [`${SESSION_COOKIE}=nonsense`, `${SESSION_COOKIE}=${session.token}x`, `other=1`]) {
      expect(checkRequest({ method: "GET", url: URL_, headers: headers({ cookie }) }, KEYS, NOW)).toMatchObject({ ok: false, status: 401 });
    }
    expect(checkRequest(req("GET"), KEYS, session.expiresAt + 1)).toMatchObject({ ok: false, status: 401 });
  });
  it("a valid login on a read-only request needs nothing else", () => {
    expect(checkRequest(req("GET", { origin: undefined, [CSRF_HEADER]: undefined }), KEYS, NOW)).toMatchObject({ ok: true, userId: UID });
  });
});

describe("a request that changes something must come from North's own page (CSRF)", () => {
  it("passes with the right origin and the right token", () => {
    expect(checkRequest(req("POST"), KEYS, NOW)).toMatchObject({ ok: true, userId: UID });
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])("%s without the CSRF token is refused (403)", (m) => {
    expect(checkRequest(req(m, { [CSRF_HEADER]: undefined }), KEYS, NOW)).toMatchObject({ ok: false, status: 403, code: "bad_csrf" });
  });
  it("a wrong or another session's token is refused", () => {
    expect(checkRequest(req("POST", { [CSRF_HEADER]: "x" }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_csrf" });
    const other = csrfFor(issueSession(UID, NOW, KEYS.session).sessionId, KEYS.csrf);
    expect(checkRequest(req("POST", { [CSRF_HEADER]: other }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_csrf" });
  });
  it("another website's origin is refused, even with a valid token", () => {
    expect(checkRequest(req("POST", { origin: "https://evil.example" }), KEYS, NOW)).toMatchObject({ ok: false, status: 403, code: "bad_origin" });
    expect(checkRequest(req("POST", { origin: "null" }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_origin" });
    expect(checkRequest(req("POST", { origin: "https://north.example.evil.example" }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_origin" });
    expect(checkRequest(req("POST", { origin: "http://north.example" }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_origin" });
  });
  it("with no Origin header, only a same-origin fetch is accepted", () => {
    expect(checkRequest(req("POST", { origin: undefined, "sec-fetch-site": "same-origin" }), KEYS, NOW).ok).toBe(true);
    expect(checkRequest(req("POST", { origin: undefined, "sec-fetch-site": "cross-site" }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_origin" });
    expect(checkRequest(req("POST", { origin: undefined, "sec-fetch-site": "same-site" }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_origin" });
    expect(checkRequest(req("POST", { origin: undefined }), KEYS, NOW)).toMatchObject({ ok: false, code: "bad_origin" }); // no way to tell: refuse
  });
  it("a configured site address is also accepted (behind a proxy the request URL can be internal)", () => {
    const f = { ...req("POST", { origin: "https://app.north.example" }), url: "http://internal:3000/api/checkout" };
    expect(checkRequest(f, KEYS, NOW)).toMatchObject({ ok: false, code: "bad_origin" });
    expect(checkRequest(f, KEYS, NOW, "https://app.north.example")).toMatchObject({ ok: true });
  });
  it("knows which methods change things", () => {
    expect(["GET", "HEAD", "OPTIONS"].map(isStateChanging)).toEqual([false, false, false]);
    expect(["POST", "PUT", "PATCH", "DELETE", "post"].map(isStateChanging)).toEqual([true, true, true, true, true]);
  });
  it("sameOrigin on an unreadable url allows nothing", () => {
    expect(sameOrigin({ method: "POST", url: "not a url", headers: headers({ origin: "https://north.example" }) })).toBe(false);
  });
});
