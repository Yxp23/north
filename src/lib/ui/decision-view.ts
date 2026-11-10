// What a Guardian answer looks like on screen. Pure: the answer comes from the backend (the Guardian's own code and plain reason),
// and this only picks the words, the icon name and the status colour. A theme never changes a status: stop stays stop.
import type { CheckoutOutcome } from "../checkout/checkout";
import type { DecisionCode } from "../guardian/types";
import { paidSentence } from "./dialog-subtitle";

export type DecisionVariant = "approved" | "wait" | "saved" | "stopped" | "scam" | "assistant";
export type Tone = "good" | "wait" | "stop";
export type IconKey = "check" | "clock" | "bookmark" | "hand" | "shield-alert" | "bot";

export type DecisionView = {
  variant: DecisionVariant;
  /** The status word shown next to the icon, so colour is never the only signal. */
  word: string;
  tone: Tone;
  icon: IconKey;
  title: string;
  /** The Guardian's own plain words. */
  reason: string;
  /** Only a gentle wait: the person may tap "Buy now". */
  canBuyNow: boolean;
};

type Answer = { decision: "approve" | "wait" | "waitlist" | "refuse"; code: DecisionCode | string; reason: string; canOverride?: boolean };

const STOP_TITLES: Partial<Record<string, string>> = {
  locked_rule: "This rule is locked",
  protected_money: "Your rent and bills are safe",
  over_budget: "That is more than you have left this week",
  bad_amount: "I can't read this price",
  bad_input: "I can't check this right now",
};

export function decisionFromAnswer(a: Answer): DecisionView {
  if (a.decision === "approve") {
    return { variant: "approved", word: "Approved", tone: "good", icon: "check", title: "Done. You bought it.", reason: a.reason, canBuyNow: false };
  }
  if (a.decision === "wait") {
    return { variant: "wait", word: "Wait", tone: "wait", icon: "clock", title: "Wait, or buy now?", reason: a.reason, canBuyNow: a.canOverride === true };
  }
  if (a.decision === "waitlist") {
    return { variant: "saved", word: "Saved for later", tone: "wait", icon: "bookmark", title: "I saved it for later", reason: a.reason, canBuyNow: false };
  }
  if (a.code === "scam_seller") {
    return { variant: "scam", word: "Scam stopped", tone: "stop", icon: "shield-alert", title: "I will not pay this seller", reason: a.reason, canBuyNow: false };
  }
  if (a.code === "untrusted_agent") {
    return { variant: "assistant", word: "Assistant stopped", tone: "stop", icon: "bot", title: "A listing tried to trick an assistant", reason: a.reason, canBuyNow: false };
  }
  return { variant: "stopped", word: "Stopped", tone: "stop", icon: "hand", title: STOP_TITLES[a.code] ?? "I can't buy this", reason: a.reason, canBuyNow: false };
}

/** The Guardian's answer inside a checkout outcome, or null when the Guardian was not asked (a changed price, nothing found) or the buy is not a clean answer. */
export function decisionFromOutcome(o: CheckoutOutcome): DecisionView | null {
  switch (o.kind) {
    case "paid":
      return decisionFromAnswer({ decision: "approve", code: o.result?.code ?? "ok", reason: paidSentence(o.purchase.amountCents) });
    case "wait":
    case "refused":
    case "waitlisted":
      return decisionFromAnswer({ ...o.result, canOverride: o.kind === "wait" ? o.result.canOverride : false });
    default:
      return null;
  }
}

/** The Home card's sentence under a past decision. One line even when the item was stopped and then saved: "Stopped at 11 PM, saved for later." */
export function stepSentence(step: { decision: "wait" | "waitlist" | "refuse"; at: string; alsoSaved?: boolean }): string {
  if (step.alsoSaved) {
    const hour = new Date(step.at).toLocaleTimeString("en-US", { hour: "numeric" });
    return `${step.decision === "refuse" ? "Stopped" : "Asked to wait"} at ${hour}, saved for later. Nothing was charged.`;
  }
  return { wait: "I asked you to wait or buy now. Nothing was charged until you chose.", waitlist: "I saved it for later. Nothing was charged.", refuse: "I did not buy it. Nothing was charged." }[step.decision];
}
