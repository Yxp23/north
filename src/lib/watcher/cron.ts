// The scheduled price check (Vercel cron) proves who it is with `Authorization: Bearer <CRON_SECRET>`.
// With no CRON_SECRET set, nobody can start it that way.
import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b); // same time whether it is right or wrong
}
