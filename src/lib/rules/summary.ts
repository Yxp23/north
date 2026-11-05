// The user's rules in plain words, for the My rules screen and for the Concierge to read.
import { effective, RULE_DELAY_MS, type BigBuyRule, type Changeable, type LateNightRule, type Rules, type Strength } from "../guardian";
import { describeRule } from "./describe";
import type { RuleKind } from "./types";

export type RuleLine = {
  kind: RuleKind;
  /** null while a brand-new rule has not started yet. */
  strength: Strength | null;
  text: string;
  /** The rule that is in force now, as numbers. The "Change a rule" screen starts from it. */
  rule?: BigBuyRule | LateNightRule;
  /** A change the user asked for that has not started yet. */
  pending?: { text: string; startsAt: string };
};

type AnyRule = { strength: Strength };

function line<T extends AnyRule>(kind: RuleKind, c: Changeable<T>, now: Date, words: (r: T) => string): RuleLine | null {
  const inForce = effective(c, now);
  const waiting = now.getTime() - c.changedAt.getTime() < RULE_DELAY_MS;
  const pendingText = waiting && JSON.stringify(c.value) !== JSON.stringify(inForce) ? (c.value ? words(c.value) : "This rule will be turned off.") : null;
  if (!inForce && !pendingText) return null;
  const out: RuleLine = { kind, strength: inForce?.strength ?? null, text: inForce ? words(inForce) : "Not on yet." };
  if (inForce) out.rule = inForce as unknown as BigBuyRule | LateNightRule;
  if (pendingText) out.pending = { text: pendingText, startsAt: new Date(c.changedAt.getTime() + RULE_DELAY_MS).toISOString() };
  return out;
}

export function summarizeRules(rules: Rules, now: Date): RuleLine[] {
  return [
    line("big_buy", rules.waitOverCents, now, (r) => describeRule("big_buy", r)),
    line("late_night", rules.waitAfterHour, now, (r) => describeRule("late_night", r)),
  ].filter((l): l is RuleLine => l !== null);
}

/** What the Concierge reads when it asks "what rules do I have now?". Plain words made by code. */
export function rulesInWords(rules: Rules, now: Date): string {
  const lines = summarizeRules(rules, now);
  if (lines.length === 0) return "You have no wait rules yet.";
  return ["Your rules now:", ...lines.map((l) => `- ${l.text}${l.pending ? ` (A change is waiting: ${l.pending.text})` : ""}`)].join("\n");
}
