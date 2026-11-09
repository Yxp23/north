import { describe, expect, it } from "vitest";
import type { CheckoutOutcome } from "../checkout/checkout";
import type { GuardianResult } from "../guardian/types";
import { decisionFromAnswer, decisionFromOutcome } from "./decision-view";
import { CHECKS, guardianChecks, traceFromCheckout } from "./guardian-trace";

const result = (decision: GuardianResult["decision"], code: GuardianResult["code"], extra: Partial<GuardianResult> = {}): GuardianResult => ({
  decision, code, reason: "Plain words.", canOverride: false, overridden: false, overriddenRules: [], triggered: [], ...extra,
});

describe("decisionFromAnswer: six looks, each with an icon and a word", () => {
  it("maps every Guardian code to one of the six", () => {
    const seen = new Map<string, string>();
    for (const [decision, code] of [
      ["approve", "ok"], ["approve", "ok_override"], ["wait", "wait_big_buy"], ["waitlist", "waitlist_late_night"], ["waitlist", "waitlist_not_yet"],
      ["refuse", "locked_rule"], ["refuse", "protected_money"], ["refuse", "over_budget"], ["refuse", "bad_amount"], ["refuse", "scam_seller"], ["refuse", "untrusted_agent"],
    ] as const) {
      const v = decisionFromAnswer({ decision, code, reason: "r", canOverride: decision === "wait" });
      seen.set(code, v.variant);
      expect(v.word.length).toBeGreaterThan(2);
    }
    expect(seen.get("ok")).toBe("approved");
    expect(seen.get("wait_big_buy")).toBe("wait");
    expect(seen.get("waitlist_not_yet")).toBe("saved");
    expect(seen.get("locked_rule")).toBe("stopped");
    expect(seen.get("protected_money")).toBe("stopped");
    expect(seen.get("over_budget")).toBe("stopped");
    expect(seen.get("scam_seller")).toBe("scam");
    expect(seen.get("untrusted_agent")).toBe("assistant");
  });
  it("never turns a stop into a good colour, and only a gentle wait offers Buy now", () => {
    for (const code of ["locked_rule", "protected_money", "over_budget", "scam_seller", "untrusted_agent", "bad_amount"] as const) {
      const v = decisionFromAnswer({ decision: "refuse", code, reason: "r", canOverride: true });
      expect(v.tone).toBe("stop");
      expect(v.canBuyNow).toBe(false);
    }
    expect(decisionFromAnswer({ decision: "wait", code: "wait_big_buy", reason: "r", canOverride: true }).canBuyNow).toBe(true);
    expect(decisionFromAnswer({ decision: "waitlist", code: "waitlist_big_buy", reason: "r", canOverride: true }).canBuyNow).toBe(false);
  });
  it("uses the Guardian's own reason, word for word", () => {
    expect(decisionFromOutcome({ kind: "refused", result: result("refuse", "locked_rule", { reason: "You said never." }) })?.reason).toBe("You said never.");
  });
  it("has no decision for outcomes where the Guardian was not asked", () => {
    expect(decisionFromOutcome({ kind: "price_changed", name: "x", seenCents: 1, nowCents: 2 })).toBeNull();
    expect(decisionFromOutcome({ kind: "not_found" })).toBeNull();
  });
});

describe("guardianChecks", () => {
  it("marks earlier checks passed, the deciding one, and later ones not reached", () => {
    const rows = guardianChecks("over_budget", "refuse");
    expect(rows).toHaveLength(CHECKS.length);
    expect(rows.slice(0, 4).every((r) => r.state === "passed")).toBe(true);
    expect(rows[4].state).toBe("stopped");
    expect(rows.slice(5).every((r) => r.state === "not_reached")).toBe(true);
  });
  it("shows a gentle wait as decided at the gentle step, after the locked and firm checks passed", () => {
    const rows = guardianChecks("wait_big_buy", "wait");
    expect(rows[9].state).toBe("decided");
    expect(rows[6].state).toBe("passed");
    expect(rows[8].state).toBe("passed");
  });
  it("shows a plain approval as every wall passed with no rule applying", () => {
    const rows = guardianChecks("ok", "approve");
    expect(rows.slice(0, 5).every((r) => r.state === "passed")).toBe(true);
    expect(rows.slice(5).every((r) => r.state === "no_rule")).toBe(true);
  });
  it("does not guess for a code it does not know", () => {
    expect(guardianChecks("something_new", "refuse").every((r) => r.state === "not_reached")).toBe(true);
  });
});

describe("traceFromCheckout", () => {
  const steps = (decision: string, code: string, charged: boolean) => [
    { label: "Asking the Money Guardian…", state: "done" as const, detail: `Money Guardian: ${decision} (${code}). Plain words.` },
    ...(charged ? [{ label: "Charging your saved PayPal…", state: "done" as const, detail: "PayPal said COMPLETED." }] : []),
  ];
  it("a paid buy: approval issued and spent, PayPal called, with PayPal's numbers", () => {
    const outcome: CheckoutOutcome = {
      kind: "paid", leftCents: 100, result: result("approve", "ok"),
      purchase: { id: "p", name: "Socks", imageUrl: "", amountCents: 1100, status: "paid", at: "", paypalOrderId: "ORD1", paypalCaptureId: "CAP1" },
    };
    const t = traceFromCheckout(outcome, steps("approve", "ok", true));
    expect(t.approval.issued).toBe(true);
    expect(t.paypal).toMatchObject({ called: true, orderId: "ORD1", captureId: "CAP1", status: "COMPLETED" });
  });
  it("a stopped buy: no approval, PayPal not called", () => {
    const outcome: CheckoutOutcome = { kind: "refused", result: result("refuse", "scam_seller") };
    const t = traceFromCheckout(outcome, steps("refuse", "scam_seller", false));
    expect(t.approval.issued).toBe(false);
    expect(t.paypal.called).toBe(false);
    expect(t.guardian.checks[1].state).toBe("stopped");
  });
  it("a changed price: the Guardian was not asked", () => {
    const t = traceFromCheckout({ kind: "price_changed", name: "x", seenCents: 1, nowCents: 2 }, []);
    expect(t.guardian.asked).toBe(false);
    expect(t.approval.issued).toBe(false);
  });
  it("an approved buy with no saved PayPal: approval made but unused", () => {
    const t = traceFromCheckout({ kind: "needs_paypal", result: result("approve", "ok") }, steps("approve", "ok", false));
    expect(t.approval).toMatchObject({ issued: true });
    expect(t.approval.note).toContain("not used");
    expect(t.paypal.called).toBe(false);
  });
});
