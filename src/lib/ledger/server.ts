import "server-only";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { FileLedger } from "./file-ledger";
import type { Ledger } from "./ledger";
import { SupabaseLedger } from "./supabase-ledger";

/** The user's time zone. The late-night rule and "this week" use it. */
export const TIME_ZONE = process.env.DEMO_TIME_ZONE || "America/New_York";

/** Demo tools (pretend clock, reset) are on in development, and in production only if DEMO_MODE=1. */
export const isDemoMode = () => process.env.DEMO_MODE === "1" || process.env.NODE_ENV !== "production";

/** One fixed demo user for now. Set NORTH_USER_ID to use a different one. */
const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";

let ledger: Ledger | undefined;

/**
 * Supabase when SUPABASE_URL and SUPABASE_SECRET_KEY are set (the secret key stays on the server).
 * Otherwise a local JSON file, for development only. In production, missing keys is an error.
 */
export function getLedger(): Ledger {
  if (ledger) return ledger;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return (ledger = new SupabaseLedger(client, process.env.NORTH_USER_ID || DEFAULT_USER_ID, TIME_ZONE));
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in production");
  }
  console.warn("[ledger] SUPABASE_URL / SUPABASE_SECRET_KEY not set: using the local file ledger (.data)");
  return (ledger = new FileLedger(path.join(process.cwd(), ".data", "north-ledger.json"), TIME_ZONE));
}
