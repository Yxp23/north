// THE ATTACKER, a permanent part of this repo. An AI red team (Claude) invents new attacks against a RUNNING North, through the
// assistant door (MCP) and the web routes, and a judge it cannot see (oracle.mts) checks the person's ledger after every move.
//
//   npm run attack -- --rounds 2                       all categories, 2 rounds each
//   npm run attack -- --rounds 1 --category races      one category
//   npm run attack -- --base http://localhost:3000 --email demo@north.local --password north-practice
//
// Start North first:   PAYMENTS_MODE=simulated STORE_MODE=demo SUPABASE_URL= SUPABASE_SECRET_KEY= npm run dev
// (Pretend payments, so a breach costs nothing. The defender is plain code: the AI is only ever the ATTACKER.)
// Results: a scoreboard here, and a full record in attacker/results/. Exit code 1 if ANY attack moved money against the rules.
import { promises as fs } from "node:fs";
import path from "node:path";
import { playRound, type Attempt } from "./brain.mts";
import { CATEGORIES } from "./categories.mts";
import { Harness } from "./harness.mts";

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const rounds = Math.max(1, Number(opt("rounds", "1")));
const base = opt("base", process.env.BASE_URL ?? "http://localhost:3000")!;
const only = opt("category");
const maxTurns = Number(opt("turns", "8"));
const email = opt("email", process.env.DEMO_LOGIN_EMAIL ?? "demo@north.local")!;
const password = opt("password", process.env.DEMO_LOGIN_PASSWORD ?? "north-practice")!;

if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is needed (the attacker is an AI).");
const chosen = CATEGORIES.filter((c) => !only || c.id === only);
if (chosen.length === 0) throw new Error(`No category called ${only}. Choose from: ${CATEGORIES.map((c) => c.id).join(", ")}`);

const h = new Harness(base, email, password);
await h.login();

const attempts: Attempt[] = [];
const dir = path.join(process.cwd(), "attacker", "results");
await fs.mkdir(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const live = path.join(dir, `${stamp}.jsonl`); // written as it goes, so a run that is stopped keeps what it did
type Score = { declined: number; tried: number; rejected: number; accepted: number; breaches: Set<string>; movedCents: number; allowed: number; rounds: number; summaries: string[] };
const score = new Map<string, Score>(chosen.map((c) => [c.id, { declined: 0, tried: 0, rejected: 0, accepted: 0, breaches: new Set(), movedCents: 0, allowed: 0, rounds: 0, summaries: [] }]));
const memory = new Map<string, string[]>(chosen.map((c) => [c.id, []]));

console.log(`\nNORTH ATTACKER  ${new Date().toISOString()}  target ${base}  ${rounds} round(s) x ${chosen.length} categories, up to ${maxTurns} turns each\n`);

for (let round = 1; round <= rounds; round++) {
  for (const category of chosen) {
    const s = score.get(category.id)!;
    await h.setup(category.fixture); // a clean, known start for every round
    process.stdout.write(`round ${round}  ${category.title.padEnd(48)} `);
    const before = attempts.length;
    let result: { summary: string; breached: boolean };
    try {
      result = await playRound({
        h, category, round, history: memory.get(category.id)!, maxTurns,
        log: (a) => {
          attempts.push(a);
          fs.appendFile(live, JSON.stringify(a) + "\n").catch(() => undefined);
          if (a.kind === "declined") { s.declined++; return; }
          if (a.kind === "no_tool_call") return;
          s.tried++;
          // "Rejected": the door stayed shut (an HTTP error, or the assistant was told refuse/wait/nothing was bought).
          const refused = a.status === 0 || a.status >= 400 || /\b(REFUSE|WAIT)\b|Nothing was bought|not connected|Please log in/i.test(a.reply);
          if (refused) s.rejected++; else s.accepted++;
        },
      });
    } catch (e) {
      console.log(`ERROR ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      continue;
    }
    const v = await h.verdict();
    s.rounds++;
    // Money moved AGAINST the rules: the purchases the judge flagged (or, if the week or the protected money broke, all of it).
    const flagged = new Set(v.breaches.map((b) => b.purchaseId).filter(Boolean));
    const against = v.breaches.some((b) => b.code === "B4" || b.code === "B5") ? v.movedCents : v.newPurchases.filter((p) => flagged.has(p.id)).reduce((n, p) => n + p.amountCents, 0);
    s.movedCents += against;
    s.allowed += v.allowed.length;
    for (const b of v.breaches) s.breaches.add(`${b.code}: ${b.what}`);
    s.summaries.push(result.summary);
    if (attempts.length - before < 4) console.log(`\n      (few attacks this round: ${result.summary})`);
    console.log(`${String(attempts.length - before).padStart(3)} attacks   ${v.breaches.length ? `BREACH x${v.breaches.length}` : "held"}   moved against the rules $${(against / 100).toFixed(2)}${v.allowed.length ? ` (${v.allowed.length} allowed buy by the person)` : ""}`);
    for (const b of v.breaches) console.log(`      !!! ${b.code} ${b.what}`);
  }
}

// ---- scoreboard --------------------------------------------------------------------------------------------------------
let totalTried = 0, totalBreaches = 0, totalMoved = 0, thin = 0;
const MIN_ATTACKS = 5; // a category with fewer attacks than this was not really tested, and the run says so
const line = "──────────────────────────────────────────────";
console.log(`\n┌${line}┬────────┬──────────┬──────────┬──────────┬──────────┬──────────────┐`);
console.log("│ category                                     │ tried  │ rejected │ answered │ declined │ breaches │ money moved  │");
console.log(`├${line}┼────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤`);
for (const c of chosen) {
  const s = score.get(c.id)!;
  totalTried += s.tried; totalBreaches += s.breaches.size; totalMoved += s.movedCents;
  if (s.tried < MIN_ATTACKS * rounds) thin++;
  console.log(`│ ${c.title.slice(0, 44).padEnd(44)} │ ${String(s.tried).padStart(6)} │ ${String(s.rejected).padStart(8)} │ ${String(s.accepted).padStart(8)} │ ${String(s.declined).padStart(8)} │ ${String(s.breaches.size).padStart(8)} │ ${`$${(s.movedCents / 100).toFixed(2)}`.padStart(12)} │`);
}
console.log(`└${line}┴────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘`);
const clean = totalMoved === 0 && totalBreaches === 0;
console.log(`\nAttacks tried: ${totalTried}   Breaches: ${totalBreaches}   MONEY MOVED AGAINST THE RULES: $${(totalMoved / 100).toFixed(2)}  ${clean ? "(must be 0: PASS)" : "(must be 0: FAIL)"}`);
if (thin) console.log(`WARNING: ${thin} categor${thin === 1 ? "y was" : "ies were"} thinly tested (fewer than ${MIN_ATTACKS} attacks per round, for example because the attacker model declined). A pass here is NOT a full pass: run it again.`);
const allowedTotal = [...score.values()].reduce((n, s) => n + s.allowed, 0);
if (allowedTotal) console.log(`(${allowedTotal} purchase(s) were inside the rules, made by the logged-in person. They are not attacks that worked.)`);

const file = path.join(dir, `${stamp}.json`);
await fs.writeFile(file, JSON.stringify({ at: new Date().toISOString(), base, rounds, categories: chosen.map((c) => c.id), totals: { tried: totalTried, breaches: totalBreaches, movedAgainstRulesCents: totalMoved, thinCategories: thin }, score: Object.fromEntries([...score].map(([k, v]) => [k, { ...v, breaches: [...v.breaches] }])), attempts }, null, 2));
await fs.writeFile(path.join(process.cwd(), "attacker", "latest-scoreboard.json"), JSON.stringify({ at: new Date().toISOString(), model: process.env.ATTACKER_MODEL || "claude-sonnet-5-5", rounds, totals: { tried: totalTried, breaches: totalBreaches, movedAgainstRulesCents: totalMoved, thinCategories: thin }, categories: Object.fromEntries([...score].map(([k, v]) => [k, { tried: v.tried, rejected: v.rejected, answered: v.accepted, declined: v.declined, breaches: v.breaches.size, movedAgainstRulesCents: v.movedCents }])) }, null, 1));
console.log(`Full record: ${path.relative(process.cwd(), file)}\n`);
process.exit(totalBreaches > 0 || totalMoved > 0 ? 1 : 0);
