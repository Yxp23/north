// "Behind the scenes" for a buy: which Guardian checks passed, which one decided, whether a signed approval was issued and whether PayPal
// was called. Nothing here is invented: it is read from the real checkout outcome and the real steps the server streamed.
// The Guardian stops at the first check that applies (see src/lib/guardian/guardian.ts), so the checks BEFORE the deciding one passed and the
// ones after it were not reached. That order is fixed, so it can be worked out from the Guardian's own code.
import type { CheckoutOutcome } from "../checkout/checkout";
import type { StepEvent } from "../agents/loop";

export const CHECKS = [
  "Price and settings can be read",
  "Seller is not flagged as a scam",
  "Not started by text hidden in a listing",
  "Rent and bill money stays safe",
  "Fits what is left this week",
  "Your must-have list",
  "Locked rules",
  "A saved item's own timer",
  "Firm rules",
  "Gentle rules",
] as const;

/** The check that gave the answer, by the Guardian's own code. -1 = every check passed with no rule applying. */
const DECIDED_BY: Record<string, number> = {
  bad_amount: 0, bad_input: 0, scam_seller: 1, untrusted_agent: 2, protected_money: 3, over_budget: 4,
  ok_essential: 5, locked_rule: 6, waitlist_not_yet: 7, ok_after_wait: 7,
  waitlist_big_buy: 8, waitlist_late_night: 8, waitlist_big_buy_late_night: 8,
  wait_big_buy: 9, wait_late_night: 9, wait_big_buy_late_night: 9, ok_override: 9, ok: -1,
};

export type CheckState = "passed" | "decided" | "stopped" | "not_reached" | "no_rule";
export type CheckRow = { label: string; state: CheckState };

export function guardianChecks(code: string, decision: string): CheckRow[] {
  const at = DECIDED_BY[code];
  if (at === undefined) return CHECKS.map((label) => ({ label, state: "not_reached" as const }));
  return CHECKS.map((label, i) => {
    if (at === -1) return { label, state: i <= 4 ? ("passed" as const) : ("no_rule" as const) };
    if (i < at) return { label, state: "passed" as const };
    if (i === at) return { label, state: decision === "refuse" ? ("stopped" as const) : ("decided" as const) };
    return { label, state: "not_reached" as const };
  });
}

export type CheckoutTrace = {
  guardian: { asked: boolean; decision?: string; code?: string; reason?: string; checks: CheckRow[] };
  approval: { issued: boolean; note: string };
  paypal: { called: boolean; note: string; orderId?: string; captureId?: string; status?: string };
  aiAgents: string;
};

const GUARDIAN_STEP = /Money Guardian: (approve|wait|waitlist|refuse) \(([a-z_]+)\)\. ?([\s\S]*)$/;
const PAYPAL_STATUS = /PayPal said ([A-Z_]+)\./;

/** What happened behind a buy, from the real outcome and the real streamed steps. */
export function traceFromCheckout(outcome: CheckoutOutcome, events: StepEvent[]): CheckoutTrace {
  let decision: string | undefined;
  let code: string | undefined;
  let reason: string | undefined;
  for (const e of events) {
    const m = e.detail ? GUARDIAN_STEP.exec(e.detail) : null;
    if (m) [, decision, code, reason] = m;
  }
  if ("result" in outcome && outcome.result) {
    decision = outcome.result.decision;
    code = outcome.result.code;
    reason = outcome.result.reason;
  }
  const asked = decision !== undefined;
  const chargeStep = events.some((e) => e.label.startsWith("Charging your saved PayPal"));
  const paypalAnswer = events.map((e) => (e.detail ? PAYPAL_STATUS.exec(e.detail)?.[1] : undefined)).find(Boolean);
  const purchase = outcome.kind === "paid" || outcome.kind === "failed" ? outcome.purchase : undefined;
  const approvedByGuardian = decision === "approve";

  const approval = !asked
    ? { issued: false, note: "The Money Guardian was not asked, so no approval was made." }
    : approvedByGuardian
      ? chargeStep
        ? { issued: true, note: "A signed approval was made for this item, this price and this person. It works once, for 2 minutes, and PayPal's step used it." }
        : { issued: true, note: "A signed approval was made, but it was not used: nothing was sent to PayPal." }
      : { issued: false, note: "No approval was made. Without one, the payment code cannot run." };

  const paypal = chargeStep
    ? {
        called: true,
        note: paypalAnswer ? `Your saved PayPal was charged. PayPal said ${paypalAnswer}.` : "Your saved PayPal was asked to charge.",
        ...(purchase?.paypalOrderId ? { orderId: purchase.paypalOrderId } : {}),
        ...(purchase?.paypalCaptureId ? { captureId: purchase.paypalCaptureId } : {}),
        ...(paypalAnswer ? { status: paypalAnswer } : {}),
      }
    : { called: false, note: "PayPal was not called. No money moved." };

  return {
    guardian: { asked, decision, code, reason, checks: asked && code ? guardianChecks(code, decision!) : [] },
    approval,
    paypal,
    aiAgents: "No AI agent was involved in this payment. The Money Guardian is plain code, and only it can approve.",
  };
}
