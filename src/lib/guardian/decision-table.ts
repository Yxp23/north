// Builds the Guardian's decision table straight from decide(), so the doc can't drift from the code.
// docs/guardian-decision-table.md is this output (decision-table.test.ts fails if they differ).
import { decide } from "./guardian";
import type { GuardianResult, Purchase, Rules, Strength, UserState } from "./types";

const NOON = new Date("2026-11-05T12:00:00Z");
const TEN_PM = new Date("2026-11-05T22:00:00Z");
const HOUR = 3_600_000;
const settled = <T>(value: T | null) => ({ value, changedAt: new Date("2026-10-01T00:00:00Z"), previous: null as T | null });

type Which = "big" | "late" | "both";

/** The demo user: $1,600 in the account, $1,200 protected, $400 a week. Wait rules use the given strength. */
function state(strength: Strength, which: Which, over: Partial<UserState> = {}, bigStrength?: Strength, lateStrength?: Strength): UserState {
  const bigOn = which === "big" || which === "both";
  const lateOn = which === "late" || which === "both";
  const rules: Rules = {
    waitOverCents: settled(bigOn ? { cents: 5000, strength: bigStrength ?? strength } : null),
    waitAfterHour: settled(lateOn ? { afterHour: 21, untilHour: 5, strength: lateStrength ?? strength, waitHours: 24 } : null),
    essentials: settled(["groceries"]),
  };
  return { balanceCents: 160_000, protectedCents: 120_000, weeklyBudgetCents: 40_000, spentThisWeekCents: 0, timeZone: "UTC", rules, ...over };
}

const buy = (over: Partial<Purchase>): Purchase => ({ amountCents: 9000, item: "Item", category: "gadgets", at: NOON, ...over });

const cell = (r: GuardianResult) => {
  const label = r.decision === "wait" ? "WAIT (Buy now works)" : r.decision === "waitlist" ? "SAVE FOR LATER (no Buy now)" : r.decision.toUpperCase();
  return `**${label}** \`${r.code}\`<br>${r.reason}`;
};

const STRENGTHS: Strength[] = ["gentle", "firm", "locked"];

type Row = { situation: string; run: (s: Strength) => GuardianResult | null };

const sinceMinus24 = (at: Date) => ({ since: new Date(at.getTime() - 24 * HOUR), waitHours: 24 });

const WAIT_ROWS: Row[] = [
  { situation: "Nothing in the way ($10, noon)", run: (s) => decide(buy({ amountCents: 1000 }), state(s, "both")) },
  { situation: "Big buy ($90, noon). Rule: wait on buys over $50", run: (s) => decide(buy({}), state(s, "big")) },
  { situation: "Late buy ($10, 10 PM). Rule: wait on buys after 9 PM", run: (s) => decide(buy({ amountCents: 1000, at: TEN_PM }), state(s, "late")) },
  { situation: "Big buy, user taps Buy now", run: (s) => decide(buy({ overrideWait: true }), state(s, "big")) },
  { situation: "Late buy, user taps Buy now", run: (s) => decide(buy({ amountCents: 1000, at: TEN_PM, overrideWait: true }), state(s, "late")) },
  { situation: "Big buy at night: both rules at once", run: (s) => decide(buy({ at: TEN_PM }), state(s, "both")) },
  { situation: "Essential ($90, noon: on the must-have list)", run: (s) => decide(buy({ category: "groceries" }), state(s, "big")) },
  { situation: "Essential, late at night ($10, 10 PM)", run: (s) => decide(buy({ category: "groceries", amountCents: 1000, at: TEN_PM }), state(s, "late")) },
  { situation: "Saved 24 hours ago, tried again (late buy)", run: (s) => decide(buy({ amountCents: 1000, at: TEN_PM, waitlist: sinceMinus24(TEN_PM) }), state(s, "late")) },
  { situation: "Saved at 10 PM, tried again at noon the next day (14 hours: the late-night rule does not apply, the timer does)", run: (s) => decide(buy({ amountCents: 1000, at: new Date(TEN_PM.getTime() + 14 * HOUR), waitlist: { since: TEN_PM, waitHours: 24 } }), state(s, "late")) },
  { situation: "Saved 23 hours ago, tried again (late buy)", run: (s) => decide(buy({ amountCents: 1000, at: TEN_PM, waitlist: { since: new Date(TEN_PM.getTime() - 23 * HOUR), waitHours: 24 } }), state(s, "late")) },
  { situation: "Saved 24 hours ago, but it is over the weekly budget", run: (s) => decide(buy({ amountCents: 9000, at: TEN_PM, waitlist: sinceMinus24(TEN_PM) }), state(s, "late", { spentThisWeekCents: 35_000 })) },
];

type Wall = { situation: string; run: () => GuardianResult };
const anyRules = state("gentle", "both");
const WALL_ROWS: Wall[] = [
  { situation: "Would use protected rent and bill money ($401 of $400 spendable)", run: () => decide(buy({ amountCents: 40_100, overrideWait: true }), state("gentle", "both", { weeklyBudgetCents: 900_000 })) },
  { situation: "Over the weekly budget ($1 over)", run: () => decide(buy({ amountCents: 100, category: "groceries", overrideWait: true }), state("gentle", "both", { spentThisWeekCents: 39_950 })) },
  { situation: "Seller flagged as a scam", run: () => decide(buy({ amountCents: 100, category: "groceries", overrideWait: true, sellerFlaggedScam: true }), anyRules) },
  { situation: "Started by an AI agent from untrusted listing text", run: () => decide(buy({ amountCents: 100, category: "groceries", overrideWait: true, agentStartedFromUntrustedText: true }), anyRules) },
  { situation: "Price can't be read ($0)", run: () => decide(buy({ amountCents: 0 }), anyRules) },
  { situation: "A wall AND a locked rule at once (over budget, big buy)", run: () => decide(buy({}), state("locked", "big", { spentThisWeekCents: 39_000 })) },
];

type Mixed = { situation: string; big: Strength; late: Strength };
const MIXED: Mixed[] = [
  { situation: "Big buy at night. Over-$50 rule gentle, after-9 PM rule firm", big: "gentle", late: "firm" },
  { situation: "Big buy at night. Over-$50 rule firm, after-9 PM rule gentle", big: "firm", late: "gentle" },
  { situation: "Big buy at night. Over-$50 rule gentle, after-9 PM rule locked", big: "gentle", late: "locked" },
  { situation: "Big buy at night. Over-$50 rule locked, after-9 PM rule firm", big: "locked", late: "firm" },
];

export function renderDecisionTable(): string {
  const out: string[] = [];
  out.push("# Money Guardian: decision table", "");
  out.push("Generated from the real `decide()` function by `src/lib/guardian/decision-table.test.ts`. Do not edit by hand:");
  out.push("run `UPDATE_DOCS=1 npx vitest run src/lib/guardian/decision-table.test.ts` after changing the Guardian.", "");
  out.push("Demo user: $1,600 in the account, $1,200 protected for rent and bills (so $400 can be spent), $400 a week.");
  out.push("Wait rules: over $50, and after 9 PM. Firm waits are 24 hours. Must-have list: groceries.", "");

  out.push("## Wait rules: strength x situation", "");
  out.push("| Situation | Gentle | Firm | Locked |", "|---|---|---|---|");
  for (const row of WAIT_ROWS) {
    out.push(`| ${row.situation} | ${STRENGTHS.map((s) => cell(row.run(s)!)).join(" | ")} |`);
  }

  out.push("", "## Mixed strengths: the strictest rule that applies wins", "");
  out.push("| Situation | Decision |", "|---|---|");
  for (const m of MIXED) out.push(`| ${m.situation} | ${cell(decide(buy({ at: TEN_PM }), state("gentle", "both", {}, m.big, m.late)))} |`);

  out.push("", "## Hard walls: refuse, whatever the strength, Buy now, essential, or served wait", "");
  out.push("| Situation | Decision |", "|---|---|");
  for (const w of WALL_ROWS) out.push(`| ${w.situation} | ${cell(w.run())} |`);

  out.push("", "## Order of checks", "");
  out.push("1. Hard walls (refuse): unreadable price or time, scam seller, AI-started buy from untrusted text, protected money, weekly budget.");
  out.push("2. Must-have list (essentials): passes EVERY user rule (gentle, firm, locked, and a saved item's timer). Never the walls.");
  out.push("3. Locked rules (refuse): never, while the rule is on. A rule change (including loosening a lock) takes effect after 24 hours; the old rule applies until then.");
  out.push("4. A saved item's own timer: it can't be bought until its full wait has passed, whatever the time of day. After that it is a normal buy.");
  out.push("5. Firm rules: save for later. No Buy now.");
  out.push("6. Gentle rules: Wait, or buy now? Buy now works right away and is logged.");
  out.push("");
  out.push("AI can only add caution: the only AI-fed inputs are the two flags in step 1, which can only refuse.");
  out.push("");
  return out.join("\n");
}
