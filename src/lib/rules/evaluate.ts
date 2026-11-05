// Checks what the Concierge understood against the rules the user has now, BEFORE they pick a strength.
// Pure code. It tells the screen which strengths are allowed and blocks anything that would be weaker.
import { effective, type BigBuyRule, type LateNightRule, type Rules, type Strength } from "../guardian";
import { compareBigBuy, compareLateNight, STRENGTH_RANK } from "./compare";
import { dollarsLabel, weakerText } from "./describe";
import type { Proposed } from "./types";

export type EvaluatedItem = {
  rule: Proposed;
  status: "new" | "same" | "tighter" | "looser";
  /** The weakest strength the user may pick. Never below the rule they have now. */
  minStrength: Strength | null;
  /** Set when status is "looser": why it can't be done, in plain words. */
  blockedText?: string;
  note?: string;
};

const maxStrength = (list: (Strength | undefined)[]): Strength | null =>
  list.reduce<Strength | null>((best, s) => (s && (best === null || STRENGTH_RANK[s] > STRENGTH_RANK[best]) ? s : best), null);

export function evaluateProposal(rules: Proposed[], current: Rules, now: Date, ctx: { weeklyBudgetCents: number }): EvaluatedItem[] {
  return rules.map((p): EvaluatedItem => {
    if (p.kind === "big_buy") {
      const inForce = effective(current.waitOverCents, now);
      const newest = current.waitOverCents.value;
      const existing = [inForce, newest].filter((r): r is BigBuyRule => r !== null);
      const minStrength = maxStrength(existing.map((r) => r.strength));
      // Compare the AMOUNT only: pretend the strongest strength, so only the amount can make it weaker.
      const asLocked: BigBuyRule = { cents: p.cents, strength: "locked" };
      const weaker = existing.find((r) => compareBigBuy(r, asLocked).verdict === "looser");
      const note = p.cents >= ctx.weeklyBudgetCents
        ? `Your plan for the week is only ${dollarsLabel(ctx.weeklyBudgetCents)}, so a rule for buys over ${dollarsLabel(p.cents)} would never stop anything.`
        : undefined;
      if (weaker) {
        return { rule: p, status: "looser", minStrength, note, blockedText: weakerText("big_buy", weaker, asLocked, ["amount"]) };
      }
      const ref = inForce ?? newest;
      const status = !ref ? "new" : compareBigBuy(ref, { cents: p.cents, strength: ref.strength, waitHours: ref.waitHours }).verdict;
      return { rule: p, status: status as EvaluatedItem["status"], minStrength, note };
    }

    const inForce = effective(current.waitAfterHour, now);
    const newest = current.waitAfterHour.value;
    const existing = [inForce, newest].filter((r): r is LateNightRule => r !== null);
    const minStrength = maxStrength(existing.map((r) => r.strength));
    const asLocked: LateNightRule = { afterHour: p.afterHour, untilHour: p.untilHour, strength: "locked" };
    const weaker = existing.find((r) => compareLateNight(r, asLocked).verdict === "looser");
    if (weaker) {
      return { rule: p, status: "looser", minStrength, blockedText: weakerText("late_night", weaker, asLocked, ["hours"]) };
    }
    const ref = inForce ?? newest;
    const status = !ref ? "new" : compareLateNight(ref, { afterHour: p.afterHour, untilHour: p.untilHour, strength: ref.strength, waitHours: ref.waitHours }).verdict;
    return { rule: p, status: status as EvaluatedItem["status"], minStrength };
  });
}
