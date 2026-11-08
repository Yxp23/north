// Checking a password. In production this is Supabase Auth (email and password). Sign-ups are NOT offered by North: people
// are created by the operator (see scripts/seed-demo-user.mjs), and sign-ups should be switched off in the Supabase dashboard.
//
// Development without Supabase: one local practice user, never in production (and never when Supabase is configured).
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { LOCAL_DEV_USER_ID, supabaseAdmin } from "../ledger/server";

export type SignIn = { ok: true; userId: string } | { ok: false; reason: "wrong" | "unavailable" };

const safe = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function signIn(email: string, password: string): Promise<SignIn> {
  const url = process.env.SUPABASE_URL;
  if (supabaseAdmin() === null) {
    // No Supabase: only a developer's machine. (supabaseAdmin() already threw in production.)
    if (process.env.NODE_ENV === "production") return { ok: false, reason: "unavailable" };
    const wantEmail = process.env.LOCAL_LOGIN_EMAIL || "demo@north.local";
    const wantPassword = process.env.LOCAL_LOGIN_PASSWORD || "north-practice";
    return safe(email.toLowerCase(), wantEmail.toLowerCase()) && safe(password, wantPassword) ? { ok: true, userId: LOCAL_DEV_USER_ID } : { ok: false, reason: "wrong" };
  }
  // The publishable key is the right key for signing a person in. Outside production we fall back to the secret key so a
  // developer does not have to set up another variable. In production the publishable key is required.
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || (process.env.NODE_ENV !== "production" ? process.env.SUPABASE_SECRET_KEY : undefined);
  if (!url || !key) return { ok: false, reason: "unavailable" };
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user?.id) return { ok: false, reason: error && error.status && error.status >= 500 ? "unavailable" : "wrong" };
    return { ok: true, userId: data.user.id };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
