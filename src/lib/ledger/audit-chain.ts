// A tamper-evident audit log. Each entry carries an HMAC (a keyed hash) of the entry before it. Edit, delete, reorder or
// insert an entry and every later link breaks. Because the HMAC uses a secret the database does not have, someone who
// can only change the database cannot repair the chain. The database also checks the links and refuses UPDATE and DELETE.
//
// Pure functions: no I/O. (`npm run audit:verify` runs verifyChain over the real log.)
import { createHmac } from "node:crypto";
import type { AuditEntry } from "./types";

export const GENESIS = "GENESIS";

/** The HMAC of one entry, tied to the one before it. JSON keeps the fields unambiguous. */
export function entryHash(prevHash: string, entry: Pick<AuditEntry, "at" | "type" | "detail">, key: Buffer): string {
  return createHmac("sha256", key).update(JSON.stringify([prevHash, Date.parse(entry.at), entry.type, entry.detail])).digest("hex");
}

/** Gives every entry that has no hash yet its link, in order. Entries that already have one are never touched. */
export function sealAudit(entries: AuditEntry[], key: Buffer): void {
  let prev = GENESIS;
  for (const entry of entries) {
    if (entry.hash) {
      prev = entry.hash;
      continue;
    }
    entry.prevHash = prev;
    entry.hash = entryHash(prev, entry, key);
    prev = entry.hash;
  }
}

export type ChainResult =
  | { ok: true; checked: number; unprotected: number }
  | { ok: false; badIndex: number; why: string };

/**
 * Walks the chain and recomputes every hash.
 *  - `allowLegacyPrefix`: entries at the very start without a hash are from before the chain existed (counted, not failed).
 *  - `partial`: the list is only the latest part of the log (the app keeps the last 300 in memory). The first entry's own link is trusted.
 *    The default is the whole log, which must start from GENESIS, so cutting entries off the START is caught.
 *  - `expectedLastHash`: if you know what the last hash should be (kept somewhere else), cutting entries off the END is caught too.
 * Without that, a chain cut at the end still verifies: nothing in the data can say "there should be more".
 */
export function verifyChain(
  entries: AuditEntry[],
  key: Buffer,
  opts: { allowLegacyPrefix?: boolean; partial?: boolean; expectedLastHash?: string } = {},
): ChainResult {
  let i = 0;
  let unprotected = 0;
  if (opts.allowLegacyPrefix) while (i < entries.length && !entries[i].hash) { unprotected++; i++; }
  let prev = GENESIS;
  let checked = 0;
  if (opts.partial && i < entries.length && entries[i].prevHash) prev = entries[i].prevHash!;
  for (; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.hash || !entry.prevHash) return { ok: false, badIndex: i, why: "an entry has no link" };
    if (entry.prevHash !== prev) return { ok: false, badIndex: i, why: "an entry does not follow the one before it" };
    if (entryHash(entry.prevHash, entry, key) !== entry.hash) return { ok: false, badIndex: i, why: "an entry was changed" };
    prev = entry.hash;
    checked++;
  }
  if (opts.expectedLastHash && prev !== opts.expectedLastHash) return { ok: false, badIndex: entries.length, why: "entries are missing from the end" };
  return { ok: true, checked, unprotected };
}
