// Builds the judges' demo week for the practice account, by running the real flows (see src/lib/demo/seed-week.ts).
//   npm run seed:demo
// Safe to run again and again: it always starts from the reset, so it never piles up. It only ever seeds DEMO_USER_ID (or, with no Supabase,
// the local practice ledger) and takes no other id. Payments are practice payments (receipts say DEMO-ORDER). The AI steps (scam check, price
// news) call the real model and Channel3 when their keys are in .env.local. Run `npm run audit:verify` afterwards to check the audit chain.
import { runDemoWeek } from "../src/lib/demo/seed-run";
import { LOCAL_DEV_USER_ID, supabaseAdmin } from "../src/lib/ledger/server";
import { formatMoney } from "../src/lib/format";

const userId = supabaseAdmin() ? process.env.DEMO_USER_ID : LOCAL_DEV_USER_ID;
if (!userId) {
  console.error("DEMO_USER_ID is not set. It names the practice account to seed. Nothing was changed.");
  process.exit(1);
}
console.log(`Building the demo week for ${userId}…`);
const report = await runDemoWeek(userId, (label) => console.log(`  … ${label}`));
for (const s of report.steps) console.log(`${s.status === "done" ? "OK     " : s.status === "skipped" ? "SKIPPED" : "FAILED "} ${s.name}${s.note ? `: ${s.note}` : ""}`);
console.log(`\nSpent this week: ${formatMoney(report.spentCents)}. Left: ${formatMoney(report.leftCents)}.`);
process.exit(report.ok ? 0 : 1);
