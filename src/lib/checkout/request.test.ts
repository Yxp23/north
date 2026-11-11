import { describe, expect, it } from "vitest";
import { parseCheckoutBody } from "./request";

const good = { productId: "912yTCL", attemptId: "attempt-12345" };

describe("what the browser may tell checkout", () => {
  it("a product and a tap id are enough", () => {
    expect(parseCheckoutBody(good, { demoOn: false })).toEqual({ ok: true, input: { productId: "912yTCL", attemptId: "attempt-12345", overrideWait: false, pretendHour: undefined, seenCents: undefined } });
  });

  it("can never set a price, quantity, currency, time, user or approval: they are simply ignored", () => {
    const r = parseCheckoutBody({ ...good, priceCents: 1, amountCents: 1, quantity: 5, currency: "EUR", at: "2020-01-01", userId: "x", approvalToken: "n1.a.b", approval: true, vaultId: "V", total: 0 }, { demoOn: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.input).sort()).toEqual(["attemptId", "overrideWait", "pretendHour", "productId", "seenCents"].sort());
  });

  it.each([
    [null], [undefined], ["x"], [5], [[]], [{}],
    [{ productId: 5, attemptId: "attempt-12345" }], [{ productId: "", attemptId: "attempt-12345" }], [{ productId: "x".repeat(81), attemptId: "attempt-12345" }],
    [{ productId: "p", attemptId: "short" }], [{ productId: "p", attemptId: "has space in it" }], [{ productId: "p", attemptId: "../../etc/passwd" }], [{ productId: "p", attemptId: "a".repeat(81) }],
  ])("bad input (%j) is refused", (b) => {
    expect(parseCheckoutBody(b, { demoOn: true }).ok).toBe(false);
  });

  it("a size is plain short text, and nothing else gets through", () => {
    const size = (v: unknown) => (parseCheckoutBody({ ...good, size: v }, { demoOn: false }) as { input: { size?: string } }).input.size;
    for (const ok of ["9", "7.5", "M", "XXL", "52", "S/M", "2T", "One size"]) expect(size(ok)).toBe(ok);
    for (const bad of ["", " 9", "x".repeat(13), "<script>", "9; DROP", 9, null, {}, ["9"]]) expect(size(bad)).toBeUndefined();
  });

  it("'Buy now' is only true for exactly true", () => {
    for (const v of ["true", 1, "yes", {}, [], null]) expect((parseCheckoutBody({ ...good, overrideWait: v }, { demoOn: true }) as { input: { overrideWait: boolean } }).input.overrideWait).toBe(false);
    expect((parseCheckoutBody({ ...good, overrideWait: true }, { demoOn: false }) as { input: { overrideWait: boolean } }).input.overrideWait).toBe(true);
  });

  it("the pretend hour works only when demo tools are on, and only for a whole hour 0 to 23", () => {
    const hour = (v: unknown, demoOn: boolean) => (parseCheckoutBody({ ...good, pretendHour: v }, { demoOn }) as { input: { pretendHour?: number } }).input.pretendHour;
    expect(hour(23, true)).toBe(23);
    expect(hour(0, true)).toBe(0);
    expect(hour(23, false)).toBeUndefined();
    for (const v of [24, -1, 1.5, "12", Number.NaN, null, Infinity]) expect(hour(v, true)).toBeUndefined();
  });

  it("the seen price is a whole positive number of cents or nothing", () => {
    const seen = (v: unknown) => (parseCheckoutBody({ ...good, seenCents: v }, { demoOn: false }) as { input: { seenCents?: number } }).input.seenCents;
    expect(seen(193)).toBe(193);
    for (const v of [0, -5, 1.5, "193", Number.NaN, 2 ** 60, null]) expect(seen(v)).toBeUndefined();
  });
});
