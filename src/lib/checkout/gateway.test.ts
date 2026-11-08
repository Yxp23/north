import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryNonceStore } from "../guardian/nonces";
import { authorizeMoney, MoneyNotAuthorizedError, type GuardianCrypto } from "../guardian/authorize";
import { APPROVAL_TTL_MS, signClaims, type Claims } from "../guardian/signed";
import { captureOrder, createOrderWithVault, refundCapture } from "../paypal";
import { createPaypalGateway } from "./gateway";

// These tests talk to the REAL gateway and the REAL PayPal functions, with only the network (fetch) replaced.
// Money moves if and only if fetch is called with a PayPal order or refund request.
const KEY = Buffer.from("k".repeat(32));
const NOW = 1_800_000_000_000;
const crypto = (): GuardianCrypto => ({ key: KEY, nonces: new MemoryNonceStore(), now: () => NOW });
const claims = (over: Partial<Claims> = {}): Claims => ({ v: 1, kind: "charge", nonce: "pur_1", userId: "u1", ref: "p1", amountCents: 1100, currency: "USD", quantity: 2, iat: NOW, exp: NOW + APPROVAL_TTL_MS, ...over });
const args = (token: string, over: object = {}) => ({
  vaultId: "VAULT-X", userId: "u1", productId: "p1", quantity: 2, approvalToken: token, amountCents: 1100, currency: "USD", customId: "pur_1", requestId: "att-1", ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
const moneyCalls = () => fetchMock.mock.calls.filter(([url]) => /checkout\/orders|payments\/captures/.test(String(url)));

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3000 }), { status: 200 });
    if (u.includes("/v2/checkout/orders")) return new Response(JSON.stringify({ id: "ORD1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP1" }] } }] }), { status: 201 });
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => void vi.unstubAllGlobals());

describe("the PayPal charge refuses to run without a matching signed approval", () => {
  it("charges once for a good approval, and sends the approved amount and currency", async () => {
    const gw = createPaypalGateway(crypto());
    const out = await gw.charge(args(signClaims(claims(), KEY)));
    expect(out).toMatchObject({ ok: true, orderId: "ORD1", captureId: "CAP1" });
    expect(moneyCalls()).toHaveLength(1);
    const body = JSON.parse(String((moneyCalls()[0][1] as RequestInit).body));
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "11.00" });
    expect(body.purchase_units[0].custom_id).toBe("pur_1");
  });

  it.each([
    ["no approval", undefined],
    ["an empty approval", ""],
    ["a made-up approval", "n1.eyJ4IjoxfQ.AAAA"],
    ["an approval signed with another key", signClaims(claims(), Buffer.from("x".repeat(32)))],
    ["an expired approval", signClaims(claims({ iat: NOW - 10 * APPROVAL_TTL_MS, exp: NOW - 9 * APPROVAL_TTL_MS }), KEY)],
    ["a refund approval", signClaims(claims({ kind: "refund" }), KEY)],
  ])("never calls PayPal with %s", async (_n, token) => {
    const out = await createPaypalGateway(crypto()).charge(args(token as string));
    expect(out.ok).toBe(false);
    expect(moneyCalls()).toHaveLength(0);
  });

  it.each([
    ["another amount", { amountCents: 1101 }],
    ["another user", { userId: "u2" }],
    ["another product", { productId: "p2" }],
    ["another currency", { currency: "EUR" }],
    ["another quantity", { quantity: 1 }],
  ])("never calls PayPal when the approval is for %s", async (_n, over) => {
    const out = await createPaypalGateway(crypto()).charge(args(signClaims(claims(), KEY), over));
    expect(out.ok).toBe(false);
    expect(moneyCalls()).toHaveLength(0);
  });

  it("an approval is single use: the second charge with it is refused (even from another gateway sharing the store)", async () => {
    const c = crypto();
    const token = signClaims(claims(), KEY);
    const results = await Promise.all([createPaypalGateway(c).charge(args(token)), createPaypalGateway(c).charge(args(token))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(moneyCalls()).toHaveLength(1);
    expect((await createPaypalGateway(c).charge(args(token))).ok).toBe(false);
    expect(moneyCalls()).toHaveLength(1);
  });

  it("if the nonce store is down, nothing is charged", async () => {
    const c: GuardianCrypto = { ...crypto(), nonces: { consume: async () => { throw new Error("db down"); }, isSpent: async () => { throw new Error("db down"); } } };
    expect((await createPaypalGateway(c).charge(args(signClaims(claims(), KEY)))).ok).toBe(false);
    expect(moneyCalls()).toHaveLength(0);
  });

  it("a 5xx from PayPal is 'uncertain' (it may have charged); a 4xx is a clear no", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => String(url).includes("oauth2")
      ? new Response(JSON.stringify({ access_token: "t", expires_in: 3000 }), { status: 200 })
      : new Response("{}", { status: 503 }));
    const a = await createPaypalGateway(crypto()).charge(args(signClaims(claims({ nonce: "n-a" }), KEY), { customId: "pur_a" }));
    expect(a).toMatchObject({ ok: false, uncertain: true });
    fetchMock.mockImplementation(async (url: string | URL) => String(url).includes("oauth2")
      ? new Response(JSON.stringify({ access_token: "t", expires_in: 3000 }), { status: 200 })
      : new Response("{}", { status: 422 }));
    const b = await createPaypalGateway(crypto()).charge(args(signClaims(claims({ nonce: "n-b" }), KEY), { customId: "pur_b" }));
    expect(b).toMatchObject({ ok: false, uncertain: false });
  });
});

describe("the PayPal money functions, called directly, refuse a forged proof", () => {
  const forged = [undefined, null, {}, { claims: claims() }, "proof", Object.freeze({ claims: Object.freeze(claims()) })];
  it.each(forged.map((f) => [JSON.stringify(f) ?? "undefined", f]))("createOrderWithVault(%s)", async (_n, f) => {
    await expect(createOrderWithVault("V", f as never, { customId: "c", requestId: "r" })).rejects.toBeInstanceOf(MoneyNotAuthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(forged.map((f) => [JSON.stringify(f) ?? "undefined", f]))("captureOrder(%s)", async (_n, f) => {
    await expect(captureOrder("ORD", f as never, "r")).rejects.toBeInstanceOf(MoneyNotAuthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(forged.map((f) => [JSON.stringify(f) ?? "undefined", f]))("refundCapture(%s)", async (_n, f) => {
    await expect(refundCapture("CAP", f as never, "r")).rejects.toBeInstanceOf(MoneyNotAuthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a real CHARGE proof can't be used to send a refund, and the other way round", async () => {
    const c = crypto();
    const charge = await authorizeMoney(signClaims(claims({ nonce: "n1" }), KEY), { kind: "charge", userId: "u1", ref: "p1", amountCents: 1100, currency: "USD", quantity: 2 }, c);
    const refund = await authorizeMoney(signClaims(claims({ kind: "refund", nonce: "n2", quantity: 1 }), KEY), { kind: "refund", userId: "u1", ref: "p1", amountCents: 1100, currency: "USD", quantity: 1 }, c);
    if (!charge.ok || !refund.ok) throw new Error("setup");
    await expect(refundCapture("CAP", charge.verified, "r")).rejects.toBeInstanceOf(MoneyNotAuthorizedError);
    await expect(createOrderWithVault("V", refund.verified, { customId: "c", requestId: "r" })).rejects.toBeInstanceOf(MoneyNotAuthorizedError);
    expect(moneyCalls()).toHaveLength(0);
  });

  it("a real refund proof sends exactly the approved amount", async () => {
    const c = crypto();
    const refund = await authorizeMoney(signClaims(claims({ kind: "refund", nonce: "n3", quantity: 1, amountCents: 725 }), KEY), { kind: "refund", userId: "u1", ref: "p1", amountCents: 725, currency: "USD", quantity: 1 }, c);
    if (!refund.ok) throw new Error("setup");
    await refundCapture("CAP-9", refund.verified, "r-1");
    const call = moneyCalls()[0];
    expect(String(call[0])).toContain("/v2/payments/captures/CAP-9/refund");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ amount: { currency_code: "USD", value: "7.25" } });
  });
});

describe("the pretend gateway (development and the attacker only)", () => {
  it("checks the signed approval just like the real one, and never calls the network", async () => {
    const { createSimulatedGateway } = await import("./gateway");
    const gw = createSimulatedGateway(crypto());
    expect((await gw.charge(args(signClaims(claims(), KEY)))).ok).toBe(true);
    expect((await gw.charge(args(undefined as unknown as string))).ok).toBe(false);
    expect((await gw.charge(args(signClaims(claims({ nonce: "other" }), KEY), { amountCents: 1 }))).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("an approval can be used once there too", async () => {
    const { createSimulatedGateway } = await import("./gateway");
    const gw = createSimulatedGateway(crypto());
    const t = signClaims(claims({ nonce: "once" }), KEY);
    expect((await gw.charge(args(t))).ok).toBe(true);
    expect((await gw.charge(args(t))).ok).toBe(false);
  });
  it("does not exist in production", async () => {
    const { createSimulatedGateway } = await import("./gateway");
    const was = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      expect(() => createSimulatedGateway(crypto())).toThrow(/production/);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = was;
    }
  });
});
