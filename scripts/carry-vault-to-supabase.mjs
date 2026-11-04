// One-off: copy the saved PayPal from the old local ledger (.data/north-ledger.json) into Supabase,
// so you don't have to click "Connect PayPal" again. Optional: connecting in the app does the same.
//   node --env-file=.env.local scripts/carry-vault-to-supabase.mjs
// The app must have created your user row first (open the app once, or hit /api/summary).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const userId = process.env.NORTH_USER_ID || "00000000-0000-4000-8000-000000000001";
const local = JSON.parse(readFileSync(".data/north-ledger.json", "utf8")).paypalVault;
if (!local?.vaultId) throw new Error("No saved PayPal in .data/north-ledger.json");

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("users")
  .update({ paypal_vault_id: local.vaultId, paypal_customer_id: local.customerId ?? null, paypal_saved_at: local.savedAt })
  .eq("id", userId)
  .select("id");
if (error) throw new Error(error.message);
if (!data?.length) throw new Error("No user row yet. Open the app once so it creates it, then run this again.");
console.log("Saved PayPal copied to Supabase. (The token itself was not printed.)");
