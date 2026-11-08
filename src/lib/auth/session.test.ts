import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { csrfFor, issueSession, SESSION_TTL_MS, verifySession } from "./session";

const KEY = Buffer.from("s".repeat(32));
const CSRF_KEY = Buffer.from("c".repeat(32));
const NOW = 1_800_000_000_000;
const UID = "6b1f5b2e-9f43-4a2d-8b6e-0c9f1d2a3b4c";

describe("sessions", () => {
  it("a fresh session verifies and names the user", () => {
    const { token } = issueSession(UID, NOW, KEY);
    const r = verifySession(token, KEY, NOW + 1000);
    expect(r).toMatchObject({ ok: true, userId: UID });
  });

  it("expires after the lifetime (hours, not days)", () => {
    expect(SESSION_TTL_MS).toBeLessThanOrEqual(12 * 3_600_000);
    const { token } = issueSession(UID, NOW, KEY);
    expect(verifySession(token, KEY, NOW + SESSION_TTL_MS - 1).ok).toBe(true);
    expect(verifySession(token, KEY, NOW + SESSION_TTL_MS).ok).toBe(false);
  });

  it("is refused with another key, an edited payload, or an edited signature", () => {
    const { token } = issueSession(UID, NOW, KEY);
    expect(verifySession(token, Buffer.from("x".repeat(32)), NOW).ok).toBe(false);
    const [p, b, s] = token.split(".");
    const edited = JSON.parse(Buffer.from(b, "base64url").toString());
    edited.uid = "00000000-0000-4000-8000-000000000099";
    expect(verifySession([p, Buffer.from(JSON.stringify(edited)).toString("base64url"), s].join("."), KEY, NOW).ok).toBe(false);
    expect(verifySession(token.slice(0, -3) + "AAA", KEY, NOW).ok).toBe(false);
  });

  it("only accepts a user id that looks like a UUID, even when correctly signed", () => {
    const sign = (uid: unknown) => {
      const body = Buffer.from(JSON.stringify({ v: 1, uid, sid: "abcdefghijklmnop", iat: NOW, exp: NOW + 1000 })).toString("base64url");
      return `s1.${body}.${createHmac("sha256", KEY).update(`s1.${body}`).digest("base64url")}`;
    };
    expect(verifySession(sign(UID), KEY, NOW).ok).toBe(true);
    for (const bad of ["../../etc/passwd", "admin", "", 5, null, "6b1f5b2e-9f43-4a2d-8b6e-0c9f1d2a3b4cX", "'; drop table users;--"]) {
      expect(verifySession(sign(bad), KEY, NOW).ok, String(bad)).toBe(false);
    }
  });

  it.each([[undefined], [null], [""], ["x"], ["s1.x.y"], ["a.b.c"], [42], ["s1." + "A".repeat(3000) + ".B"]])("garbage %j is refused without throwing", (junk) => {
    expect(verifySession(junk as string, KEY, NOW).ok).toBe(false);
  });

  it("every session gets its own id", () => {
    expect(issueSession(UID, NOW, KEY).sessionId).not.toBe(issueSession(UID, NOW, KEY).sessionId);
  });
});

describe("the CSRF token", () => {
  it("is tied to the session id and the server's key", () => {
    const a = issueSession(UID, NOW, KEY);
    const b = issueSession(UID, NOW, KEY);
    expect(csrfFor(a.sessionId, CSRF_KEY)).toBe(csrfFor(a.sessionId, CSRF_KEY));
    expect(csrfFor(a.sessionId, CSRF_KEY)).not.toBe(csrfFor(b.sessionId, CSRF_KEY));
    expect(csrfFor(a.sessionId, CSRF_KEY)).not.toBe(csrfFor(a.sessionId, KEY));
  });
});
