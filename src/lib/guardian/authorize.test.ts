import { describe, expect, it } from "vitest";
import { authorizeMoney, MoneyNotAuthorizedError, requireVerified, type GuardianCrypto } from "./authorize";
import { MemoryNonceStore, type NonceStore } from "./nonces";
import { rootSecret, subkey } from "./secret";
import { APPROVAL_TTL_MS, signClaims, type Claims, type Expected } from "./signed";

const KEY = Buffer.from("k".repeat(32));
const NOW = 1_800_000_000_000;
const crypto = (nonces: NonceStore = new MemoryNonceStore(), now = NOW): GuardianCrypto => ({ key: KEY, nonces, now: () => now });
const claims = (over: Partial<Claims> = {}): Claims => ({ v: 1, kind: "charge", nonce: "pur_1", userId: "u1", ref: "p1", amountCents: 500, currency: "USD", quantity: 1, iat: NOW, exp: NOW + APPROVAL_TTL_MS, ...over });
const want: Expected = { kind: "charge", userId: "u1", ref: "p1", amountCents: 500, currency: "USD", quantity: 1 };

describe("authorizeMoney", () => {
  it("accepts a good approval once, then never again (single use)", async () => {
    const c = crypto();
    const t = signClaims(claims(), KEY);
    const first = await authorizeMoney(t, want, c);
    expect(first.ok).toBe(true);
    const second = await authorizeMoney(t, want, c);
    expect(second).toEqual({ ok: false, reason: "already used" });
  });

  it("a mismatch does not spend the approval", async () => {
    const c = crypto();
    const t = signClaims(claims(), KEY);
    expect((await authorizeMoney(t, { ...want, amountCents: 501 }, c)).ok).toBe(false);
    expect((await authorizeMoney(t, want, c)).ok).toBe(true);
  });

  it("two servers sharing one store can't both spend it", async () => {
    const store = new MemoryNonceStore();
    const t = signClaims(claims(), KEY);
    const results = await Promise.all([authorizeMoney(t, want, crypto(store)), authorizeMoney(t, want, crypto(store))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("fails closed when the nonce store breaks", async () => {
    const broken: NonceStore = { consume: async () => { throw new Error("db down"); }, isSpent: async () => { throw new Error("db down"); } };
    expect((await authorizeMoney(signClaims(claims(), KEY), want, crypto(broken))).ok).toBe(false);
  });

  it("refuses an expired approval", async () => {
    const t = signClaims(claims(), KEY);
    expect((await authorizeMoney(t, want, crypto(new MemoryNonceStore(), NOW + APPROVAL_TTL_MS + 1))).ok).toBe(false);
  });
});

describe("requireVerified (what the PayPal money functions call)", () => {
  it("returns the claims of a real proof", async () => {
    const r = await authorizeMoney(signClaims(claims(), KEY), want, crypto());
    if (!r.ok) throw new Error("expected ok");
    expect(requireVerified(r.verified, "charge").amountCents).toBe(500);
  });

  it("a proof for a charge can't be used for a refund", async () => {
    const r = await authorizeMoney(signClaims(claims(), KEY), want, crypto());
    if (!r.ok) throw new Error("expected ok");
    expect(() => requireVerified(r.verified, "refund")).toThrow(MoneyNotAuthorizedError);
  });

  it.each([[undefined], [null], [{}], [{ claims: claims() }], ["token"], [Object.freeze({ claims: Object.freeze(claims()) })]])("a hand-made proof (%j) is refused", (fake) => {
    expect(() => requireVerified(fake, "charge")).toThrow(MoneyNotAuthorizedError);
  });

  it("a copy of a real proof is refused", async () => {
    const r = await authorizeMoney(signClaims(claims(), KEY), want, crypto());
    if (!r.ok) throw new Error("expected ok");
    expect(() => requireVerified({ ...r.verified }, "charge")).toThrow(MoneyNotAuthorizedError);
  });

  it("the proof can't be edited after the fact", async () => {
    const r = await authorizeMoney(signClaims(claims(), KEY), want, crypto());
    if (!r.ok) throw new Error("expected ok");
    expect(() => { (r.verified.claims as Claims).amountCents = 1; }).toThrow();
  });
});

describe("the server secret", () => {
  it("is required in production", () => {
    expect(() => rootSecret({ NODE_ENV: "production" })).toThrow(/NORTH_SECRET/);
    expect(() => rootSecret({ NODE_ENV: "production", NORTH_SECRET: "" })).toThrow();
  });
  it("must be long enough, everywhere", () => {
    expect(() => rootSecret({ NODE_ENV: "development", NORTH_SECRET: "short" })).toThrow(/at least/);
    expect(() => rootSecret({ NODE_ENV: "production", NORTH_SECRET: "short" })).toThrow(/at least/);
  });
  it("falls back to a development secret only outside production", () => {
    expect(rootSecret({ NODE_ENV: "test" }).length).toBeGreaterThanOrEqual(32);
  });
  it("gives each job its own key", () => {
    const env = { NORTH_SECRET: "s".repeat(40) };
    const keys = (["approval", "audit", "session", "csrf"] as const).map((l) => subkey(l, env).toString("hex"));
    expect(new Set(keys).size).toBe(4);
    expect(keys.every((k) => k !== Buffer.from(env.NORTH_SECRET).toString("hex"))).toBe(true);
  });
});
