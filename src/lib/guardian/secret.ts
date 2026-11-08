// The server's root secret (NORTH_SECRET). Everything that must be unforgeable (signed approvals, the audit chain,
// the session cookie) uses its own key derived from it, so one key never does two jobs.
//
// Fail closed: in production a missing or short secret is an error, never a fallback. Outside production a fixed
// development secret is used (with a warning), so tests and `npm run dev` work without setup.
import { createHmac } from "node:crypto";

export const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "north-development-secret-not-for-production-use";
let warned = false;

export function rootSecret(env: Record<string, string | undefined> = process.env): Buffer {
  const s = env.NORTH_SECRET;
  if (s !== undefined && s !== "") {
    if (s.length < MIN_SECRET_LENGTH) throw new Error(`NORTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
    return Buffer.from(s, "utf8");
  }
  if (env.NODE_ENV === "production") throw new Error("NORTH_SECRET is not set. It is required in production.");
  if (!warned && env.NODE_ENV !== "test") {
    warned = true;
    console.warn("[security] NORTH_SECRET is not set: using a development secret. Never do this in production.");
  }
  return Buffer.from(DEV_SECRET, "utf8");
}

/** A key for one purpose. Different labels give unrelated keys. */
export function subkey(label: "approval" | "audit" | "session" | "csrf", env: Record<string, string | undefined> = process.env): Buffer {
  return createHmac("sha256", rootSecret(env)).update(`north:v1:${label}`).digest();
}
