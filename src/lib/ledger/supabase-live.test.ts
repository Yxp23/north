// The same contract tests, against your REAL Supabase project. Skipped unless you ask for it:
//   npm run test:supabase        (needs SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local)
// Each test uses its own throwaway user and deletes it afterwards. Your demo user is never touched.
import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ledgerContract } from "./ledger-contract";
import { SupabaseLedger } from "./supabase-ledger";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (process.env.RUN_LIVE_SUPABASE_TESTS === "1" && url && key) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  ledgerContract("Supabase (LIVE project)", async () => {
    const userId = randomUUID();
    return {
      ledger: new SupabaseLedger(client, userId, "America/New_York", () => new Date("2026-11-04T15:00:00Z")),
      // Deleting the user removes their purchases, rules, audit log and webhook ids (on delete cascade).
      cleanup: async () => {
        await client.from("users").delete().eq("id", userId);
      },
    };
  });
} else {
  describe.skip("Supabase (LIVE project): run `npm run test:supabase` to include", () => it("skipped", () => {}));
}
