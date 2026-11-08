import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryNonceStore, type NonceStore } from "../guardian/nonces";
import { subkey } from "../guardian/secret";
import { CSRF_HEADER, SESSION_COOKIE } from "./cookies";
import { csrfFor, issueSession } from "./session";

let store: NonceStore;
vi.mock("../ledger/server", () => ({ getNonceStore: () => store }));

const UID = "6b1f5b2e-9f43-4a2d-8b6e-0c9f1d2a3b4c";
const mk = () => {
  const s = issueSession(UID, Date.now(), subkey("session"));
  const req = (method = "GET") =>
    new Request("https://north.example/api/summary", {
      method,
      headers: { cookie: `${SESSION_COOKIE}=${s.token}`, origin: "https://north.example", [CSRF_HEADER]: csrfFor(s.sessionId, subkey("csrf")) },
    });
  return { s, req };
};

beforeEach(() => {
  store = new MemoryNonceStore();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("authenticate", () => {
  it("lets a logged-in person through and says who they are", async () => {
    const { authenticate } = await import("./guard");
    const r = await authenticate(mk().req());
    expect(r).toEqual({ ok: true, userId: UID });
  });

  it("turns away a request with no login (401)", async () => {
    const { authenticate } = await import("./guard");
    const r = await authenticate(new Request("https://north.example/api/summary"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("after Log out the same cookie stops working, even a copy of it", async () => {
    const { authenticate, revokeSession } = await import("./guard");
    const { s, req } = mk();
    expect((await authenticate(req())).ok).toBe(true);
    await revokeSession(UID, s.sessionId, s.expiresAt);
    const after = await authenticate(req());
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.response.status).toBe(401);
  });

  it("fails closed if it can't tell whether the session was logged out", async () => {
    const { authenticate } = await import("./guard");
    store = { consume: async () => true, isSpent: async () => { throw new Error("db down"); } };
    const r = await authenticate(mk().req());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });

  it("never lets anyone in when the server has no secret in production", async () => {
    const { authenticate } = await import("./guard");
    const request = mk().req(); // made while the development secret still exists
    const was = { env: process.env.NODE_ENV, secret: process.env.NORTH_SECRET };
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.NORTH_SECRET;
    try {
      const r = await authenticate(request);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(503);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = was.env;
      if (was.secret !== undefined) process.env.NORTH_SECRET = was.secret;
    }
  });

  it("a state-changing request without the CSRF token is 403, and the response is never cached", async () => {
    const { authenticate } = await import("./guard");
    const { s } = mk();
    const r = await authenticate(new Request("https://north.example/api/refund", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${s.token}`, origin: "https://north.example" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(r.response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
