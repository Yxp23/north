// A real read and a real write to the database, so a free-tier Supabase project is never paused for being idle.
// The write is a rate-limit counter (a tiny row that is overwritten), so it adds nothing that grows.
import "server-only";
import { getRateLimiter, supabaseAdmin } from "../ledger/server";

export type KeepAlive = { database: "supabase" | "local files"; read: boolean; write: boolean };

export async function keepDatabaseAwake(): Promise<KeepAlive> {
  const db = supabaseAdmin();
  if (!db) return { database: "local files", read: true, write: await getRateLimiter().allow("cron:keepalive", 100_000, 86_400) };
  let read = false;
  try {
    const { error } = await db.from("users").select("id").limit(1);
    read = !error;
  } catch {
    read = false;
  }
  const write = await getRateLimiter().allow("cron:keepalive", 100_000, 86_400);
  return { database: "supabase", read, write };
}
