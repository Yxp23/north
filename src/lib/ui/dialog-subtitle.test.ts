import { describe, expect, it } from "vitest";
import type { CheckoutOutcome } from "../checkout/checkout";
import type { GuardianResult } from "../guardian/types";
import { decisionSubtitle, yourRuleSentence, type RuleFact } from "./dialog-subtitle";

const res = (decision: GuardianResult["decision"], code: GuardianResult["code"], extra: Partial<GuardianResult> = {}): GuardianResult => ({
  decision, code, reason: "Guardian words.", canOverride: false, overridden: false, overriddenRules: [], triggered: [], ...extra,
});
const RULES: RuleFact[] = [
  { kind: "big_buy", rule: { cents: 5000, strength: "gentle" } },
  { kind: "late_night", rule: { afterHour: 21, untilHour: 5, strength: "firm", waitHours: 24 } },
];
const facts = { name: "Running Series Sneakers", priceCents: 7254, leftCents: 9501, rules: RULES };

describe("decision subtitles say the person's own rule and the price", () => {
  it("a paid buy says the rules said yes and what PayPal paid (never the stale 'okay to buy')", () => {
    const o = { kind: "paid", purchase: { amountCents: 3600 }, result: res("approve", "ok") } as unknown as CheckoutOutcome;
    expect(decisionSubtitle(o, facts)).toBe("Your rules said yes. PayPal paid $36.00.");
  });
  it("a gentle wait", () => {
    const o: CheckoutOutcome = { kind: "wait", result: res("wait", "wait_big_buy", { canOverride: true, triggered: ["big_buy"] }) };
    expect(decisionSubtitle(o, facts)).toBe("You asked me to wait on buys over $50. This is $72.54.");
  });
  it("a firm save, for the late-night rule", () => {
    const o = { kind: "waitlisted", result: res("waitlist", "waitlist_late_night", { triggered: ["late_night"], waitHours: 24 }), item: {} } as unknown as CheckoutOutcome;
    expect(decisionSubtitle(o, facts)).toBe("You asked me to wait a day on buys after 9pm. This is $72.54. I will remind you tomorrow.");
  });
  it("over budget and protected money use this week's real numbers", () => {
    expect(decisionSubtitle({ kind: "refused", result: res("refuse", "over_budget") }, facts)).toBe("This is $72.54. You have $95.01 left this week.");
    expect(decisionSubtitle({ kind: "refused", result: res("refuse", "protected_money") }, facts)).toContain("rent and bills");
  });
  it("a locked rule", () => {
    const rules: RuleFact[] = [{ kind: "big_buy", rule: { cents: 30000, strength: "locked" } }];
    expect(decisionSubtitle({ kind: "refused", result: res("refuse", "locked_rule", { triggered: ["big_buy"] }) }, { ...facts, rules })).toBe("You said never to buy things over $300. This is $72.54.");
  });
  it("a scam seller names the seller", () => {
    expect(decisionSubtitle({ kind: "refused", result: res("refuse", "scam_seller") }, { ...facts, seller: "bad-deals.shop" })).toBe("bad-deals.shop was flagged as a scam when you checked a deal. This is $72.54.");
  });
  it("falls back to the Guardian's own words when it does not know the rule", () => {
    expect(decisionSubtitle({ kind: "wait", result: res("wait", "wait_big_buy", { triggered: ["big_buy"] }) }, { ...facts, rules: null })).toBeNull();
    expect(decisionSubtitle({ kind: "waitlisted", result: res("waitlist", "waitlist_not_yet"), item: {} } as unknown as CheckoutOutcome, facts)).toBeNull();
  });
  it("never repeats the title words", () => {
    const o: CheckoutOutcome = { kind: "wait", result: res("wait", "wait_big_buy", { triggered: ["big_buy"] }) };
    expect(decisionSubtitle(o, facts)).not.toMatch(/wait, or buy now/i);
    expect(yourRuleSentence([], RULES, "wait")).toBe("");
  });
});
