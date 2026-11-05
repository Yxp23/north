// Plain words for rules: about a 5th-grade reading level, short sentences. Every number here comes from
// checked data (whole cents and whole hours), never from model text.
import { durationLabel, hourLabel, DEFAULT_WAIT_HOURS, type BigBuyRule, type LateNightRule, type Strength } from "../guardian";
import type { Weaker } from "./compare";
import type { Proposed, UnsupportedNote } from "./types";

/** 5000 -> "$50", 4999 -> "$49.99", 123400 -> "$1,234". */
export function dollarsLabel(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** 21, 5 -> "9pm to 5am". */
export const windowLabel = (afterHour: number, untilHour: number) => `${hourLabel(afterHour)} to ${hourLabel(untilHour)}`;

/** "You want me to wait a day on buys over $50. Is that right?" */
export function readBack(p: Proposed): string {
  const what = p.kind === "big_buy" ? `buys over ${dollarsLabel(p.cents)}` : `buys from ${windowLabel(p.afterHour, p.untilHour)}`;
  if (p.suggested === "locked") {
    return p.kind === "big_buy"
      ? `You want me to never let you buy things over ${dollarsLabel(p.cents)}. Is that right?`
      : `You want me to never let you buy anything from ${windowLabel(p.afterHour, p.untilHour)}. Is that right?`;
  }
  const wait = p.waitHours ? `wait ${durationLabel(p.waitHours)}` : "wait";
  return `You want me to ${wait} on ${what}. Is that right?`;
}

const NOTE_REASON: Record<UnsupportedNote["reason"], string> = {
  category: "I can't make a rule about a kind of thing yet. I can wait on big buys or late-night buys.",
  store_or_brand: "I can't make a rule about a store or a brand yet.",
  budget_or_protected_money: "I can't change your weekly plan or your rent money here.",
  loosening: "I can only make rules stricter. I can't make a rule weaker.",
  not_a_rule: "That does not sound like a rule about buying.",
  other: "I can't check that one yet.",
};

export function unsupportedText(note: UnsupportedNote): string {
  return `${note.quote ? `About "${note.quote}": ` : ""}${NOTE_REASON[note.reason]}`;
}

export function readBackNotes(input: { combined: boolean; unsupported: UnsupportedNote[] }): string[] {
  const notes: string[] = [];
  if (input.combined) {
    notes.push("You said both together. I can't check both together, so I will make two rules. That is stricter: I will wait on every big buy and on every late-night buy.");
  }
  return [...notes, ...input.unsupported.map(unsupportedText)];
}

export const questionFor = (missing: "amount" | "hour") =>
  missing === "amount" ? "How much is too much? Tell me a dollar amount, like $50." : "What time should I start waiting? For example, 9pm.";

export function describeRule(kind: "big_buy", rule: BigBuyRule): string;
export function describeRule(kind: "late_night", rule: LateNightRule): string;
export function describeRule(kind: "big_buy" | "late_night", rule: BigBuyRule | LateNightRule): string {
  const big = kind === "big_buy" ? (rule as BigBuyRule) : null;
  const night = kind === "late_night" ? (rule as LateNightRule) : null;
  const what = big ? `buys over ${dollarsLabel(big.cents)}` : `buys from ${windowLabel(night!.afterHour, night!.untilHour)}`;
  if (rule.strength === "locked") return big ? `Never buy things over ${dollarsLabel(big.cents)}.` : `Never buy anything from ${windowLabel(night!.afterHour, night!.untilHour)}.`;
  if (rule.strength === "firm") return `Wait ${durationLabel(rule.waitHours ?? DEFAULT_WAIT_HOURS)} on ${what}. I save it and remind you.`;
  return `Wait on ${what}. You can still tap Buy now.`;
}

export function strengthOneLiner(s: Strength): string {
  return {
    gentle: "I ask you: wait, or buy now? You can tap Buy now.",
    firm: "I save it for later. You can't buy it until the wait is over.",
    locked: "Never, while this rule is on. Only changing the rule can undo it, and that takes a day.",
  }[s];
}

/** Why a new rule is weaker than the old one. Built from checked numbers only. */
export function weakerText(
  kind: "big_buy" | "late_night",
  cur: BigBuyRule | LateNightRule,
  next: BigBuyRule | LateNightRule,
  weaker: Weaker[],
): string {
  const tail = "and I can only make rules stricter.";
  if (kind === "big_buy" && weaker.includes("amount")) {
    return `You already have a rule for buys over ${dollarsLabel((cur as BigBuyRule).cents)}. Over ${dollarsLabel((next as BigBuyRule).cents)} is weaker, ${tail}`;
  }
  if (kind === "late_night" && weaker.includes("hours")) {
    const c = cur as LateNightRule;
    return `You already have a rule for buys from ${windowLabel(c.afterHour, c.untilHour)}. That time is shorter, ${tail}`;
  }
  if (weaker.includes("strength")) return `You already have a stronger rule for that. A weaker one is not allowed, ${tail}`;
  return `Your wait is already longer than that. A shorter wait is weaker, ${tail}`;
}
