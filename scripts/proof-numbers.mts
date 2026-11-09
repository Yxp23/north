// Writes src/content/proof.json: the real numbers the "How North works" page shows in its proof section.
// Run it (npm run proof) before a deploy so the page matches the repo. It runs the unit tests, reads the attacker's scoreboard and
// counts the eval cases. It never invents a number, and the page says when it was made.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CASES as DEALS } from "../evals/scam/cases.ts";
import { INJECTIONS } from "../evals/scam/injection-cases.ts";
import { CASES as CONCIERGE } from "../evals/concierge/cases.ts";

const out = path.join(mkdtempSync(path.join(tmpdir(), "north-proof-")), "vitest.json");
try {
  execFileSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${out}`], { stdio: "ignore", env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" } });
} catch {
  /* a failing test still writes the report: the numbers below say so */
}
const r = JSON.parse(readFileSync(out, "utf8"));
const files: { name: string; assertionResults: { status: string }[] }[] = r.testResults;
const props = files.filter((f) => f.name.endsWith("guardian/properties.test.ts")).flatMap((f) => f.assertionResults);
const board = JSON.parse(readFileSync("attacker/latest-scoreboard.json", "utf8"));
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();

const proof = {
  generatedAt: new Date().toISOString(),
  commit,
  tests: { files: r.numTotalTestSuites ? files.length : 0, total: r.numTotalTests, passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests },
  guardianPropertyTests: props.length,
  attacker: { at: board.at, tried: board.totals.tried, breaches: board.totals.breaches, movedAgainstRulesCents: board.totals.movedAgainstRulesCents, categories: Object.keys(board.categories).length, model: "Haiku 4.5" },
  evals: { dealCases: DEALS.length, injectionListings: INJECTIONS.length, conciergeRuleCases: CONCIERGE.length },
};
writeFileSync("src/content/proof.json", `${JSON.stringify(proof, null, 2)}\n`);
console.log(proof);
