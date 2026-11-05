// "Change or remove a rule", done BY HAND on the My rules screen. No AI is involved.
// The user may set a rule to anything, or turn it off:
//   - stricter than what is in force  -> starts at once,
//   - weaker, or off                  -> waits one day (the old rule stays in force until then).
// Only the user's own tap reaches this (via /api/rules/change). The Concierge cannot: a structure test checks it.
import type { BigBuyRule, LateNightRule } from "../guardian";
import type { Ledger } from "../ledger/ledger";
import { addAudit } from "../ledger/logic";
import type { StoredChangeable } from "../ledger/types";
import { bigBuyTiming, lateNightTiming, removeTiming, type Timing } from "./compare";
import { describeRule } from "./describe";
import { ChangeRequestSchema } from "./save-schema";
import { inForce, makeChange, startsAt } from "./stored";
import type { RuleKind } from "./types";

export type ChangeResult =
  | { ok: true; changed: boolean; kind?: RuleKind; removed?: boolean; text?: string; startsNow: boolean; startsAt: string; message: string }
  | { ok: false; message: string };

export type ChangeDeps = { ledger: Ledger; now(): Date };

const WEAKER = "Saved. This makes the rule weaker, so it starts in one day. Until then, your old rule stays.";
const clean = <T extends { strength: string; waitHours?: number }>(r: T): T => {
  const { waitHours, ...rest } = r;
  return (r.strength === "firm" && waitHours ? { ...rest, waitHours } : rest) as T; // a wait time only means something for firm
};
const words = (kind: RuleKind, r: BigBuyRule | LateNightRule) => (kind === "big_buy" ? describeRule("big_buy", r as BigBuyRule) : describeRule("late_night", r as LateNightRule));
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function changeRule(input: unknown, deps: ChangeDeps): Promise<ChangeResult> {
  const parsed = ChangeRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "I could not read that change. Nothing was changed." };
  const req = parsed.data;
  const now = deps.now();

  return deps.ledger.update<ChangeResult>((data) => {
    const kind: RuleKind = req.action === "remove" ? req.kind : req.rule.kind;
    const current = (kind === "big_buy" ? data.rules.waitOverCents : data.rules.waitAfterHour) as StoredChangeable<BigBuyRule | LateNightRule>;
    const force = inForce(current, now);

    // What the rule should become. `null` = off.
    let next: BigBuyRule | LateNightRule | null = null;
    let timing: Timing;
    if (req.action === "remove") {
      timing = removeTiming(force);
      if (current.value === null) {
        // Already off, or already on its way off. Asking again must not restart the waiting day.
        const message = force ? "That rule is already going to turn off. Until then, it stays." : "That rule is already off.";
        return { ok: true, changed: false, startsNow: !force, startsAt: force ? startsAt("in_a_day", new Date(current.changedAt)) : startsAt("now", now), message };
      }
    } else if (req.rule.kind === "big_buy") {
      next = clean<BigBuyRule>({ cents: req.rule.cents, strength: req.rule.strength, waitHours: req.rule.waitHours });
      timing = bigBuyTiming(force as BigBuyRule | null, next);
    } else {
      next = clean<LateNightRule>({ afterHour: req.rule.afterHour, untilHour: req.rule.untilHour, strength: req.rule.strength, waitHours: req.rule.waitHours });
      timing = lateNightTiming(force as LateNightRule | null, next);
    }

    // Nothing to do if it already is exactly this, both in force and as the newest setting.
    if (sameJson(force, next) && sameJson(current.value, next)) {
      return { ok: true, changed: false, startsNow: true, startsAt: startsAt("now", now), message: "That is the same as your rule now." };
    }

    const change = makeChange<BigBuyRule | LateNightRule>(next, current, timing, now);
    if (kind === "big_buy") data.rules.waitOverCents = change as StoredChangeable<BigBuyRule>;
    else data.rules.waitAfterHour = change as StoredChangeable<LateNightRule>;

    const what = next ? `${words(kind, next)} (${next.strength})` : `The ${kind === "big_buy" ? "big-buy" : "late-night"} rule was turned off`;
    const when = timing === "now" ? "Started right away." : "Starts in one day.";
    addAudit(data, "rule_change", `By hand: ${what}. ${when}`, now);

    const start = startsAt(timing, now);
    const message = timing === "now" ? "Saved. It starts now." : next ? WEAKER : "Done. I will turn this rule off in one day. Until then, it stays.";
    return {
      ok: true, changed: true, kind, startsNow: timing === "now", startsAt: start, message,
      ...(next ? { text: words(kind, next) } : { removed: true }),
    };
  });
}
