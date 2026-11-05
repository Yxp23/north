// Is a new rule at least as strict as the old one? The Concierge may only create or tighten rules,
// and this is the code that decides, never the model. A rule is "looser" if ANY part got weaker,
// even when another part got stricter.
import { DEFAULT_WAIT_HOURS, inLateNightWindow, type BigBuyRule, type LateNightRule, type Strength } from "../guardian";

export type Verdict = "new" | "same" | "tighter" | "looser";
export type Weaker = "amount" | "hours" | "strength" | "wait";
export type Comparison = { verdict: Verdict; weaker: Weaker[]; mixed: boolean };

export const STRENGTH_RANK: Record<Strength, number> = { gentle: 0, firm: 1, locked: 2 };
const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** +1 stricter, 0 same, -1 weaker. */
function strengthDim(cur: { strength: Strength }, next: { strength: Strength }) {
  return sign(STRENGTH_RANK[next.strength] - STRENGTH_RANK[cur.strength]);
}

/** A wait time only matters when both rules are firm. A longer wait is stricter. */
function waitDim(cur: { strength: Strength; waitHours?: number }, next: { strength: Strength; waitHours?: number }) {
  if (cur.strength !== "firm" || next.strength !== "firm") return 0;
  return sign((next.waitHours ?? DEFAULT_WAIT_HOURS) - (cur.waitHours ?? DEFAULT_WAIT_HOURS));
}

function combine(dims: [Weaker, -1 | 0 | 1][]): Comparison {
  const weaker = dims.filter(([, d]) => d < 0).map(([name]) => name);
  const stricter = dims.some(([, d]) => d > 0);
  if (weaker.length) return { verdict: "looser", weaker, mixed: stricter };
  return { verdict: stricter ? "tighter" : "same", weaker: [], mixed: false };
}

const NEW: Comparison = { verdict: "new", weaker: [], mixed: false };

export function compareBigBuy(cur: BigBuyRule | null, next: BigBuyRule): Comparison {
  if (!cur) return NEW;
  return combine([
    ["amount", sign(cur.cents - next.cents)], // a LOWER amount is stricter
    ["strength", strengthDim(cur, next)],
    ["wait", waitDim(cur, next)],
  ]);
}

/** The hours of the day a night window covers (it may cross midnight). */
export function hourSet(afterHour: number, untilHour: number): boolean[] {
  return Array.from({ length: 24 }, (_, h) => inLateNightWindow(h, { afterHour, untilHour }));
}

export function compareLateNight(cur: LateNightRule | null, next: LateNightRule): Comparison {
  if (!cur) return NEW;
  const before = hourSet(cur.afterHour, cur.untilHour);
  const after = hourSet(next.afterHour, next.untilHour);
  const lost = before.some((on, h) => on && !after[h]);
  const gained = after.some((on, h) => on && !before[h]);
  return combine([
    ["hours", lost ? -1 : gained ? 1 : 0],
    ["strength", strengthDim(cur, next)],
    ["wait", waitDim(cur, next)],
  ]);
}

// ---- when does a change start? ------------------------------------------------------------------
// Making a rule stricter is safe, so it starts right away. Anything that could let a buy through that
// was blocked before (a higher amount, a weaker strength, a shorter night, turning it off) waits one day,
// so a bad moment can't talk the user out of their own rule. A mix (stricter in one way, weaker in
// another) counts as weaker. The comparison is always against the rule IN FORCE right now.
export type Timing = "now" | "in_a_day";
const timing = (c: Comparison): Timing => (c.verdict === "looser" ? "in_a_day" : "now");

export const bigBuyTiming = (inForce: BigBuyRule | null, next: BigBuyRule): Timing => timing(compareBigBuy(inForce, next));
export const lateNightTiming = (inForce: LateNightRule | null, next: LateNightRule): Timing => timing(compareLateNight(inForce, next));
/** Turning a rule off weakens it. If nothing is in force there is nothing to wait for. */
export const removeTiming = (inForce: unknown | null): Timing => (inForce ? "in_a_day" : "now");
