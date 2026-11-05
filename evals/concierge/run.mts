// Eval for the Concierge: runs about 25 rule sentences through the REAL agent (the real Claude API) and prints accuracy.
//   npm run eval:concierge            (needs ANTHROPIC_API_KEY in .env.local; makes real API calls, a few cents)
//   npm run eval:concierge -- --only big-30,category      (run some cases)
//   npm run eval:concierge -- --min 85                    (exit 1 if accuracy is below 85%)
import Anthropic from "@anthropic-ai/sdk";
import { AGENT_MODEL } from "../../src/lib/agents/models";
import { runConcierge, type ConciergePayload } from "../../src/lib/agents/concierge/concierge";
import { defaultLedgerData, toRules } from "../../src/lib/ledger/logic";
import type { Proposed } from "../../src/lib/rules/types";
import { CASES, type Case, type ExpectedRule } from "./cases";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const only = flag("only")?.split(",");
const minAccuracy = Number(flag("min") ?? 0);
const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local and run: npm run eval:concierge");
  process.exit(2);
}

const NOW = new Date("2026-11-05T15:00:00Z");
const demo = defaultLedgerData(NOW, "America/New_York");
const context = { rules: toRules(demo.rules), weeklyBudgetCents: demo.weeklyBudgetCents, protectedCents: demo.protectedCents, now: NOW };
const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });

type Actual = "proposal" | "rejected" | "needs_info" | "error";
function classify(p: ConciergePayload): Actual {
  if (p.kind === "proposal") return p.items.some((i) => i.status !== "looser") ? "proposal" : "rejected";
  if (p.kind === "cannot") return "rejected";
  return p.kind;
}

function ruleMatches(exp: ExpectedRule, got: Proposed): string | null {
  if (exp.kind !== got.kind) return `kind ${got.kind}`;
  if (exp.kind === "big_buy" && got.kind === "big_buy") {
    if (exp.cents !== got.cents) return `amount ${got.cents}`;
  } else if (exp.kind === "late_night" && got.kind === "late_night") {
    if (exp.afterHour !== got.afterHour) return `after ${got.afterHour}`;
    if ((exp.untilHour ?? 5) !== got.untilHour) return `until ${got.untilHour}`;
  }
  if ((exp.waitHours ?? undefined) !== (got.waitHours ?? undefined)) return `wait ${got.waitHours ?? "none"}h`;
  return null;
}

type Result = { c: Case; ok: boolean; detail: string; calls: number; hint?: boolean; safe: boolean };

async function runCase(c: Case): Promise<Result> {
  const out = await runConcierge({ client, text: c.text, context });
  const p = out.payload;
  const actual = classify(p);
  let ok = false;
  let detail = "";
  let hint: boolean | undefined;
  const e = c.expect;

  if (e.outcome === "rejected") {
    ok = actual === "rejected";
    detail = ok ? "" : `expected nothing applied, got ${actual}`;
  } else if (e.outcome === "needs_info") {
    ok = p.kind === "needs_info" && p.missing === e.missing;
    detail = ok ? "" : `expected a question about the ${e.missing}, got ${p.kind}${p.kind === "needs_info" ? ` (${p.missing})` : ""}`;
  } else if (p.kind === "proposal") {
    const got = p.items.map((i) => i.rule);
    const problems: string[] = [];
    if (got.length !== e.rules.length) problems.push(`expected ${e.rules.length} rule(s), got ${got.length}`);
    for (const exp of e.rules) {
      const same = got.find((g) => g.kind === exp.kind);
      if (!same) { problems.push(`missing ${exp.kind}`); continue; }
      const why = ruleMatches(exp, same);
      if (why) problems.push(`${exp.kind}: ${why}`);
      if (exp.suggested) hint = same.suggested === exp.suggested;
    }
    ok = problems.length === 0;
    detail = problems.join("; ");
  } else {
    detail = `expected a proposal, got ${p.kind}${p.kind === "error" ? `: ${p.message}` : ""}`;
  }

  // Safety: when nothing should apply, no rule may come out as savable. When a rule is expected, nothing beyond it.
  let safe = true;
  if (c.safety) {
    if (e.outcome === "rejected") safe = actual !== "proposal";
    else if (e.outcome === "proposal" && p.kind === "proposal") safe = p.items.every((i) => i.status === "looser" || e.rules.some((r) => r.kind === i.rule.kind && !ruleMatches(r, i.rule)));
  }
  return { c, ok, detail, calls: out.modelCalls, hint, safe };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const started = Date.now();
console.log(`Concierge eval: ${cases.length} cases, model ${AGENT_MODEL}\nDemo rules: wait on buys over $50 (gentle); wait on buys after 9pm (firm, a day)\n`);
const results = await pool(cases, 4, runCase);

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.c.id.padEnd(20)} ${JSON.stringify(r.c.text).slice(0, 70)}${r.ok ? "" : `\n        ${r.detail}`}`);
}

const passed = results.filter((r) => r.ok).length;
const accuracy = (passed / results.length) * 100;
const hints = results.filter((r) => r.hint !== undefined);
const safety = results.filter((r) => r.c.safety);
const unsafe = safety.filter((r) => !r.safe);
const calls = results.reduce((n, r) => n + r.calls, 0);

console.log(`\nAccuracy:        ${passed}/${results.length} (${accuracy.toFixed(0)}%)`);
console.log(`Strength hints:  ${hints.filter((r) => r.hint).length}/${hints.length} (only a suggestion; the user always picks)`);
console.log(`Safety cases:    ${safety.length - unsafe.length}/${safety.length} held (nothing weaker or injected could be saved)`);
console.log(`Model calls:     ${calls} (about ${(calls / results.length).toFixed(1)} per case, limit 6)`);
console.log(`Time:            ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (unsafe.length) console.log(`UNSAFE: ${unsafe.map((r) => r.c.id).join(", ")}`);
process.exit(unsafe.length || accuracy < minAccuracy ? 1 : 0);
