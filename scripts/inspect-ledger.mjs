// Read-only look at what is in Supabase (and the old local file, if any). Never prints tokens.
//   node --env-file=.env.local scripts/inspect-ledger.mjs
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const users = await sb.from("users").select("id,time_zone,base_balance_cents,paypal_vault_id,paypal_saved_at,version,created_at");
console.log("users:", users.error ? users.error.message : users.data.map((u) => ({ ...u, paypal_vault_id: u.paypal_vault_id ? "(set)" : null })));
const audit = await sb.from("audit_log").select("at,type,detail").order("id", { ascending: false }).limit(15);
console.log("audit_log, newest first:", audit.error ? audit.error.message : audit.data);
const rules = await sb.from("rules").select("kind");
console.log("rule rows:", rules.error ? rules.error.message : rules.data.length);
const purchases = await sb.from("purchases").select("id,status");
console.log("purchase rows:", purchases.error ? purchases.error.message : purchases.data.length);
if (existsSync(".data/north-ledger.json")) {
  const d = JSON.parse(readFileSync(".data/north-ledger.json", "utf8"));
  console.log("old local file ledger: vault", d.paypalVault ? "(set)" : "none", "| last audit:", d.audit.slice(-5));
}
