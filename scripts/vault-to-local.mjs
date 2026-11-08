// Dev only: copy the saved PayPal (vault id) from Supabase into the local file ledger (.data), so the end-to-end run can charge
// the sandbox without Supabase. The token is never printed. .data is not committed.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const id = "00000000-0000-4000-8000-000000000001";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.from("users").select("paypal_vault_id, paypal_customer_id, paypal_saved_at").eq("id", id).maybeSingle();
if (error || !data?.paypal_vault_id) throw new Error("No saved PayPal found in Supabase for the demo person.");
mkdirSync(".data", { recursive: true });
const file = ".data/north-ledger.json";
const ledger = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
if (!ledger) throw new Error("Start the app once first (log in) so the local ledger exists, then run this again.");
ledger.paypalVault = { vaultId: data.paypal_vault_id, customerId: data.paypal_customer_id ?? undefined, savedAt: data.paypal_saved_at ?? new Date().toISOString() };
writeFileSync(file, JSON.stringify(ledger, null, 2));
console.log("Saved PayPal copied to the local ledger.");
