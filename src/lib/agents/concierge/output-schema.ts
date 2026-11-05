// What the Concierge model may hand back, and the code that checks it. The model's output is DATA:
// it is parsed against a strict schema, every number is range-checked, quotes must really be in what the
// user wrote, and anything that fails goes back to the model to fix (or ends as "I can't do that").
// Nothing here can approve a purchase or loosen a rule. It can only describe a rule to propose.
import { z } from "zod";
import { DEFAULT_WAIT_HOURS, type Strength } from "../../guardian";
import { hourSet } from "../../rules/compare";
import type { Proposed, UnsupportedNote } from "../../rules/types";

const strength = z.enum(["gentle", "firm", "locked"]);
const quote = z.string().max(200).optional();
const waitHours = z.number().int().min(1).max(168).nullable().optional(); // up to a week

const bigBuy = z.object({
  kind: z.literal("big_buy"),
  amount_dollars: z.number().min(1).max(100_000).nullable(), // null = the user did not say how much
  wait_hours: waitHours,
  suggested_strength: strength.nullable().optional(),
  quote,
}).strict();

const lateNight = z.object({
  kind: z.literal("late_night"),
  after_hour: z.number().int().min(0).max(23).nullable(), // null = the user did not say what time
  until_hour: z.number().int().min(0).max(23).nullable().optional(),
  wait_hours: waitHours,
  suggested_strength: strength.nullable().optional(),
  quote,
}).strict().refine((r) => r.until_hour == null || r.after_hour == null || r.after_hour !== r.until_hour, {
  message: "after_hour and until_hour are the same hour, so the window would be empty",
});

const unsupported = z.object({
  reason: z.enum(["category", "store_or_brand", "budget_or_protected_money", "loosening", "not_a_rule", "other"]),
  quote,
}).strict();

export const ModelOutputSchema = z.object({
  rules: z.array(z.discriminatedUnion("kind", [bigBuy, lateNight])).max(6),
  unsupported: z.array(unsupported).max(6),
  /** True when the user joined two conditions in one sentence ("over $50 after 9pm"). */
  combined_conditions: z.boolean().optional(),
}).strict();

export type ParsedResult =
  | { kind: "proposal"; rules: Proposed[]; unsupported: UnsupportedNote[]; combined: boolean }
  | { kind: "needs_info"; missing: "amount" | "hour" }
  | { kind: "cannot"; unsupported: UnsupportedNote[] };

export type ValidationOutcome = { ok: true; result: ParsedResult } | { ok: false; errors: string[] };

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function pathLabel(path: PropertyKey[]): string {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`)).join("");
}

const RANK: Record<Strength, number> = { gentle: 0, firm: 1, locked: 2 };
const strongest = (a?: Strength, b?: Strength) => (a && b ? (RANK[a] >= RANK[b] ? a : b) : (a ?? b));

type Big = Extract<Proposed, { kind: "big_buy" }>;
type Night = Extract<Proposed, { kind: "late_night" }>;

/** Two big-buy rules become one: the lower amount and the longer wait, so it is at least as strict as both. */
function mergeBig(a: Big, b: Big): Big {
  const lower = a.cents <= b.cents ? a : b;
  const wait = Math.max(a.waitHours ?? 0, b.waitHours ?? 0) || undefined;
  return { ...lower, waitHours: wait, suggested: strongest(a.suggested, b.suggested) };
}

/** Two night windows become one only if together they are one unbroken stretch of hours. */
function mergeNight(a: Night, b: Night): Night | null {
  const A = hourSet(a.afterHour, a.untilHour);
  const B = hourSet(b.afterHour, b.untilHour);
  const union = A.map((on, h) => on || B[h]);
  const count = union.filter(Boolean).length;
  if (count === 24) return null; // every hour: not a "late-night" rule
  // An unbroken stretch has exactly one place where it starts (an "on" hour after an "off" hour).
  const starts = union.map((on, h) => (on && !union[(h + 23) % 24] ? h : -1)).filter((h) => h >= 0);
  if (starts.length !== 1) return null;
  const afterHour = starts[0];
  const untilHour = (afterHour + count) % 24;
  const wait = Math.max(a.waitHours ?? 0, b.waitHours ?? 0) || undefined;
  const best = hourSet(a.afterHour, a.untilHour).filter(Boolean).length >= B.filter(Boolean).length ? a : b;
  return { ...best, afterHour, untilHour, waitHours: wait, suggested: strongest(a.suggested, b.suggested) };
}

export function validateModelOutput(raw: unknown, userText: string): ValidationOutcome {
  const parsed = ModelOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${pathLabel(i.path) || "answer"}: ${i.message}`);
    return { ok: false, errors: errors.length ? errors : ["The answer is not in the right shape."] };
  }
  const out = parsed.data;
  const text = squash(userText);
  // A quote is only kept if it really is in what the user wrote. A made-up quote is dropped.
  const keep = (q?: string) => (q && text.includes(squash(q)) ? q : undefined);

  // Missing pieces become a question (the amount first).
  if (out.rules.some((r) => r.kind === "big_buy" && r.amount_dollars === null)) return { ok: true, result: { kind: "needs_info", missing: "amount" } };
  if (out.rules.some((r) => r.kind === "late_night" && r.after_hour === null)) return { ok: true, result: { kind: "needs_info", missing: "hour" } };

  const notes: UnsupportedNote[] = out.unsupported.map((u) => ({ reason: u.reason, ...(keep(u.quote) ? { quote: keep(u.quote) } : {}) }));

  const bigs: Big[] = [];
  const nights: Night[] = [];
  for (const r of out.rules) {
    const common = { ...(r.wait_hours ? { waitHours: r.wait_hours } : {}), ...(r.suggested_strength ? { suggested: r.suggested_strength } : {}), ...(keep(r.quote) ? { quote: keep(r.quote) } : {}) };
    if (r.kind === "big_buy") bigs.push({ kind: "big_buy", cents: Math.round(r.amount_dollars! * 100), ...common });
    else nights.push({ kind: "late_night", afterHour: r.after_hour!, untilHour: r.until_hour ?? 5, ...common });
  }

  const rules: Proposed[] = [];
  if (bigs.length) rules.push(bigs.reduce(mergeBig));
  if (nights.length) {
    let merged: Night | null = nights[0];
    for (const n of nights.slice(1)) merged = merged ? mergeNight(merged, n) : null;
    if (merged) rules.push(merged);
    else notes.push({ reason: "other" });
  }

  if (rules.length === 0) {
    return { ok: true, result: { kind: "cannot", unsupported: notes.length ? notes : [{ reason: "not_a_rule" }] } };
  }
  return { ok: true, result: { kind: "proposal", rules, unsupported: notes, combined: out.combined_conditions === true } };
}

export { DEFAULT_WAIT_HOURS };
