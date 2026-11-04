// Quick health check of the Supabase setup: key works, functions exist, and what the key may do.
//   node --env-file=.env.local scripts/probe-supabase.mjs
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const seed = { time_zone: "UTC", base_balance_cents: 1, protected_cents: 0, weekly_budget_cents: 1, rules: [] };
const probe = "11111111-1111-4111-8111-111111111111"; // a throwaway id, never a real user
for (const [label, run] of [
  ["select from users (direct)", () => sb.from("users").select("id").limit(1)],
  ["rpc ledger_load", () => sb.rpc("ledger_load", { p_user_id: probe, p_seed: seed })],
  ["rpc ledger_reset", () => sb.rpc("ledger_reset", { p_user_id: probe, p_seed: seed })],
]) {
  const { error } = await run();
  console.log(`${error ? "FAIL" : "ok  "}  ${label}${error ? `  — ${error.message} (code ${error.code})` : ""}`);
}
