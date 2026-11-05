// Saves rules the user confirmed. This is the ONLY place the Concierge's work becomes real, and it only
// happens after the user taps Save. Everything is re-checked here:
//   - the shape (zod), so a doctored request can't sneak anything in,
//   - tighten-only against the rule in force AND the newest setting, so nothing gets weaker,
//   - all or nothing, under the ledger's lock, against fresh data.
// The Concierge can only make rules STRICTER, and a stricter rule starts right away (making yourself
// safer never needs a waiting day). Weakening a rule is only possible by hand (see change.ts) and waits a day.
import type { BigBuyRule, LateNightRule } from "../guardian";
import type { Ledger } from "../ledger/ledger";
import { addAudit } from "../ledger/logic";
import type { StoredChangeable } from "../ledger/types";
import { compareBigBuy, compareLateNight } from "./compare";
import { inForce, makeChange, startsAt } from "./stored";
import { describeRule, weakerText } from "./describe";
import { SaveRequestSchema } from "./save-schema";
import type { SaveRule } from "./types";

export type SavedRule = { kind: SaveRule["kind"]; text: string; strength: SaveRule["strength"]; startsAt: string; startsNow: boolean };
export type SaveResult = { ok: true; saved: SavedRule[]; message: string } | { ok: false; message: string };

export type SaveDeps = { ledger: Ledger; now(): Date };

const clean = <T extends { strength: string; waitHours?: number }>(r: T): T => {
  const { waitHours, ...rest } = r;
  return (r.strength === "firm" && waitHours ? { ...rest, waitHours } : rest) as T; // a wait time only means something for firm
};

export async function saveRules(input: unknown, deps: SaveDeps): Promise<SaveResult> {
  const parsed = SaveRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "I could not read that rule. Nothing was saved." };
  const wanted = parsed.data.rules;
  if (new Set(wanted.map((r) => r.kind)).size !== wanted.length) {
    return { ok: false, message: "Please save one rule of each kind at a time. Nothing was saved." };
  }

  const now = deps.now();
  return deps.ledger.update<SaveResult>((data) => {
    type Plan = { rule: SaveRule; value: BigBuyRule | LateNightRule; current: StoredChangeable<BigBuyRule> | StoredChangeable<LateNightRule> };
    const plan: Plan[] = [];

    for (const rule of wanted) {
      if (rule.kind === "big_buy") {
        const next = clean<BigBuyRule>({ cents: rule.cents, strength: rule.strength, waitHours: rule.waitHours });
        const cur = data.rules.waitOverCents;
        let same = true;
        for (const existing of [inForce(cur, now), cur.value]) {
          const c = compareBigBuy(existing, next);
          if (c.verdict === "looser") return { ok: false, message: `${weakerText("big_buy", existing!, next, c.weaker)} Nothing was saved.` };
          if (c.verdict !== "same") same = false;
        }
        if (!same) plan.push({ rule, value: next, current: cur });
      } else {
        const next = clean<LateNightRule>({ afterHour: rule.afterHour, untilHour: rule.untilHour, strength: rule.strength, waitHours: rule.waitHours });
        const cur = data.rules.waitAfterHour;
        let same = true;
        for (const existing of [inForce(cur, now), cur.value]) {
          const c = compareLateNight(existing, next);
          if (c.verdict === "looser") return { ok: false, message: `${weakerText("late_night", existing!, next, c.weaker)} Nothing was saved.` };
          if (c.verdict !== "same") same = false;
        }
        if (!same) plan.push({ rule, value: next, current: cur });
      }
    }

    if (plan.length === 0) return { ok: true, saved: [], message: "You already have that rule." };

    // Nothing here is weaker than what is in force (checked above), so every change starts at once.
    const saved: SavedRule[] = [];
    for (const { rule, value, current } of plan) {
      const change = makeChange<unknown>(value, current as StoredChangeable<unknown>, "now", now);
      const text = rule.kind === "big_buy" ? describeRule("big_buy", value as BigBuyRule) : describeRule("late_night", value as LateNightRule);
      if (rule.kind === "big_buy") data.rules.waitOverCents = change as StoredChangeable<BigBuyRule>;
      else data.rules.waitAfterHour = change as StoredChangeable<LateNightRule>;
      addAudit(data, "rule_change", `${text} (${rule.strength}). Started right away.`, now);
      saved.push({ kind: rule.kind, text, strength: rule.strength, startsAt: startsAt("now", now), startsNow: true });
    }
    return { ok: true, saved, message: "Saved. It starts now." };
  });
}
