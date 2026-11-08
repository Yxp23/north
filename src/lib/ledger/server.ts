import "server-only";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MemoryNonceStore, type NonceStore } from "../guardian/nonces";
import { UUID_RE } from "../auth/session";
import { MemoryRateLimiter, SupabaseRateLimiter, type RateLimiter } from "../ratelimit/limiter";
import { FileLedger } from "./file-ledger";
import type { Ledger } from "./ledger";
import { SupabaseLedger } from "./supabase-ledger";
import { SupabaseNonceStore } from "./supabase-nonces";

export { isDemoMode } from "../demo/mode";

/** The user's time zone. The late-night rule and "this week" use it. */
export const TIME_ZONE = process.env.DEMO_TIME_ZONE || "America/New_York";

/** The one user of the local development ledger (no Supabase). The same id the app used before logins existed. */
export const LOCAL_DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

let admin: SupabaseClient | null | undefined;

/** The Supabase client that uses the SECRET key (server only). Null when Supabase is not set up (development only). */
export function supabaseAdmin(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key) return (admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  if (process.env.NODE_ENV === "production") throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in production");
  console.warn("[ledger] SUPABASE_URL / SUPABASE_SECRET_KEY not set: using the local file ledger (.data)");
  return (admin = null);
}

const ledgers = new Map<string, Ledger>();

/**
 * One ledger per person. `userId` must come from a verified login (auth/guard.ts), or from an assistant's key after the
 * person it belongs to was found. Anything that is not a UUID is refused, so it can never be steered at another file or row.
 */
export function getLedger(userId: string): Ledger {
  if (!UUID_RE.test(userId)) throw new Error("Not a user id.");
  const have = ledgers.get(userId);
  if (have) return have;
  const client = supabaseAdmin();
  const made: Ledger = client
    ? new SupabaseLedger(client, userId, TIME_ZONE)
    : new FileLedger(path.join(process.cwd(), ".data", userId === LOCAL_DEV_USER_ID ? "north-ledger.json" : `north-ledger-${userId}.json`), TIME_ZONE);
  ledgers.set(userId, made);
  return made;
}

/** True if this person already has a ledger. (An unknown assistant key must never create a user.) */
export async function userExists(userId: string): Promise<boolean> {
  if (!UUID_RE.test(userId)) return false;
  const client = supabaseAdmin();
  if (client) {
    const { data, error } = await client.from("users").select("id").eq("id", userId).maybeSingle();
    return !error && !!data;
  }
  const { promises: fs } = await import("node:fs");
  const file = path.join(process.cwd(), ".data", userId === LOCAL_DEV_USER_ID ? "north-ledger.json" : `north-ledger-${userId}.json`);
  return fs.access(file).then(() => true, () => false);
}

let nonces: NonceStore | undefined;

/**
 * Where spent Guardian approvals are remembered. Supabase when configured (so no server can spend one twice);
 * otherwise memory, for development only.
 */
export function getNonceStore(): NonceStore {
  if (nonces) return nonces;
  const client = supabaseAdmin();
  return (nonces = client ? new SupabaseNonceStore(client) : new MemoryNonceStore());
}

let limiter: RateLimiter | undefined;

/** Rate limits live in the database when there is one (shared by every server, kept across restarts). */
export function getRateLimiter(): RateLimiter {
  if (limiter) return limiter;
  const client = supabaseAdmin();
  return (limiter = client ? new SupabaseRateLimiter(client) : new MemoryRateLimiter());
}

/** Everyone who has a ledger (for the scheduled price check). Capped, so one run can't grow without limit. */
export async function listUserIds(limit = 50): Promise<string[]> {
  const client = supabaseAdmin();
  if (client) {
    const { data, error } = await client.from("users").select("id").limit(limit);
    if (error) throw new Error(`Could not list people: ${error.message}`);
    return (data ?? []).map((r: { id: string }) => r.id).filter((id) => UUID_RE.test(id));
  }
  const { promises: fs } = await import("node:fs");
  const names = await fs.readdir(path.join(process.cwd(), ".data")).catch(() => [] as string[]);
  return names
    .map((n) => (n === "north-ledger.json" ? LOCAL_DEV_USER_ID : n.match(/^north-ledger-([0-9a-f-]{36})\.json$/)?.[1]))
    .filter((id): id is string => !!id && UUID_RE.test(id))
    .slice(0, limit);
}

/**
 * Whose purchase is this? A PayPal webhook names a payment, not a person. The answer comes from OUR records
 * (never from the webhook's own claims about a user), and only for a payment we really made.
 */
export async function findPurchaseOwner(ref: { purchaseId?: string; captureId?: string; orderId?: string }): Promise<string | null> {
  const clean = (v?: string) => (v && v.length <= 120 && /^[A-Za-z0-9_.-]+$/.test(v) ? v : undefined);
  const purchaseId = clean(ref.purchaseId);
  const captureId = clean(ref.captureId);
  const orderId = clean(ref.orderId);
  if (!purchaseId && !captureId && !orderId) return null;
  const client = supabaseAdmin();
  if (client) {
    const filters = [purchaseId && `id.eq.${purchaseId}`, captureId && `capture_id.eq.${captureId}`, orderId && `paypal_order_id.eq.${orderId}`].filter(Boolean).join(",");
    const { data, error } = await client.from("purchases").select("user_id").or(filters).limit(1);
    if (error) throw new Error(`Could not look up the payment: ${error.message}`);
    return data?.[0]?.user_id ?? null;
  }
  for (const id of await listUserIds()) {
    const d = await getLedger(id).read();
    if (d.purchases.some((p) => p.id === purchaseId || (captureId && p.captureId === captureId) || (orderId && p.paypalOrderId === orderId))) return id;
  }
  return null;
}
