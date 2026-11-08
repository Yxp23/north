import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { APPROVAL_TTL_MS, signClaims, verifyClaims, type Claims, type Expected } from "./signed";

const KEY = Buffer.from("k".repeat(32));
const OTHER = Buffer.from("o".repeat(32));
const NOW = 1_800_000_000_000;

const claims = (over: Partial<Claims> = {}): Claims => ({
  v: 1, kind: "charge", nonce: "pur_1", userId: "user-1", ref: "prod-1", amountCents: 1100, currency: "USD", quantity: 1,
  iat: NOW, exp: NOW + APPROVAL_TTL_MS, ...over,
});
const expected = (over: Partial<Expected> = {}): Expected => ({ kind: "charge", userId: "user-1", ref: "prod-1", amountCents: 1100, currency: "USD", quantity: 1, ...over });

describe("a signed approval", () => {
  it("verifies when everything matches", () => {
    const t = signClaims(claims(), KEY);
    const r = verifyClaims(t, expected(), KEY, NOW + 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims.nonce).toBe("pur_1");
  });

  it("expires within minutes", () => {
    expect(APPROVAL_TTL_MS).toBeLessThanOrEqual(5 * 60_000);
    const t = signClaims(claims(), KEY);
    expect(verifyClaims(t, expected(), KEY, NOW + APPROVAL_TTL_MS - 1).ok).toBe(true);
    expect(verifyClaims(t, expected(), KEY, NOW + APPROVAL_TTL_MS).ok).toBe(false);
    expect(verifyClaims(t, expected(), KEY, NOW + APPROVAL_TTL_MS + 3_600_000).ok).toBe(false);
  });

  it("is not valid before it was made (clock skew beyond a few seconds)", () => {
    const t = signClaims(claims(), KEY);
    expect(verifyClaims(t, expected(), KEY, NOW - 60_000).ok).toBe(false);
  });

  it.each([
    ["another user", { userId: "user-2" }],
    ["another product", { ref: "prod-2" }],
    ["one cent more", { amountCents: 1101 }],
    ["one cent less", { amountCents: 1099 }],
    ["another currency", { currency: "EUR" }],
    ["another quantity", { quantity: 2 }],
    ["a refund instead of a charge", { kind: "refund" as const }],
  ])("is refused for %s", (_n, over) => {
    const t = signClaims(claims(), KEY);
    expect(verifyClaims(t, expected(over), KEY, NOW).ok).toBe(false);
  });

  it("is refused when signed with another secret", () => {
    expect(verifyClaims(signClaims(claims(), OTHER), expected(), KEY, NOW).ok).toBe(false);
  });

  it("is refused when the payload is edited and the old signature kept", () => {
    const [h, p, s] = signClaims(claims(), KEY).split(".");
    const edited = JSON.parse(Buffer.from(p, "base64url").toString());
    edited.amountCents = 1;
    const forged = [h, Buffer.from(JSON.stringify(edited)).toString("base64url"), s].join(".");
    expect(verifyClaims(forged, expected({ amountCents: 1 }), KEY, NOW).ok).toBe(false);
  });

  it("is refused when the signature is edited", () => {
    const t = signClaims(claims(), KEY);
    expect(verifyClaims(t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA"), expected(), KEY, NOW).ok).toBe(false);
  });

  it.each([
    [undefined], [null], [""], ["x"], ["a.b.c.d"], [123], [{}], ["n1.e30.AAAA"], ["n1." + "x".repeat(5000) + ".AAAA"],
  ])("garbage (%j) is refused and does not throw", (junk) => {
    expect(verifyClaims(junk as unknown as string, expected(), KEY, NOW).ok).toBe(false);
  });

  it("claims with the wrong shape are refused even when correctly signed", () => {
    const sign = (payload: unknown) => {
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const mac = createHmac("sha256", KEY).update(`n1.${body}`).digest("base64url");
      return `n1.${body}.${mac}`;
    };
    for (const bad of [
      { ...claims(), amountCents: 11.5 },
      { ...claims(), amountCents: -5 },
      { ...claims(), amountCents: "1100" },
      { ...claims(), quantity: 0 },
      { ...claims(), nonce: "" },
      { ...claims(), v: 2 },
      { ...claims(), kind: "other" },
      { ...claims(), exp: "never" },
      { ...claims(), extra: "field" },
    ]) {
      expect(verifyClaims(sign(bad), expected({ amountCents: (bad as { amountCents: number }).amountCents }), KEY, NOW).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("will not sign nonsense", () => {
    expect(() => signClaims(claims({ amountCents: 0 }), KEY)).toThrow();
    expect(() => signClaims(claims({ amountCents: 1.5 }), KEY)).toThrow();
    expect(() => signClaims(claims({ exp: NOW }), KEY)).toThrow();
    expect(() => signClaims(claims(), Buffer.alloc(8))).toThrow();
  });
});
