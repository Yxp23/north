// Checks the tamper-evident audit log: recomputes every link with the server's secret and reports any entry that was edited,
// deleted, reordered or inserted.
//   npm run audit:verify
// Reads Supabase (SUPABASE_URL + SUPABASE_SECRET_KEY) when set, otherwise the local files in .data. Uses NORTH_SECRET (the same
// one the app uses). Exit code 0 = intact, 1 = something does not add up.
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { verifyChain } from "../src/lib/ledger/audit-chain";
import { subkey } from "../src/lib/guardian/secret";
import type { AuditEntry } from "../src/lib/ledger/types";

const key = subkey("audit");
let bad = 0;
let total = 0;
let legacy = 0;

function report(who: string, entries: AuditEntry[], partial: boolean) {
  const r = verifyChain(entries, key, { allowLegacyPrefix: true, partial });
  if (r.ok) {
    total += r.checked;
    legacy += r.unprotected;
    console.log(`OK    ${who}: ${r.checked} entries intact${r.unprotected ? `, ${r.unprotected} older ones written before the chain existed` : ""}`);
  } else {
    bad++;
    const e = entries[r.badIndex];
    console.log(`BAD   ${who}: entry ${r.badIndex + 1} of ${entries.length}: ${r.why}${e ? ` (${e.at} ${e.type})` : ""}`);
  }
}

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (url && secret) {
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const byUser = new Map<string, AuditEntry[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("audit_log").select("user_id, at, type, detail, prev_hash, hash").order("user_id").order("id").range(from, from + 999);
    if (error) throw new Error(`Could not read the audit log: ${error.message}`);
    for (const r of data ?? []) {
      const list = byUser.get(r.user_id) ?? [];
      list.push({ at: new Date(r.at).toISOString(), type: r.type, detail: r.detail, ...(r.hash ? { prevHash: r.prev_hash ?? undefined, hash: r.hash } : {}) });
      byUser.set(r.user_id, list);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  if (byUser.size === 0) console.log("The audit log is empty.");
  for (const [uid, entries] of byUser) report(uid, entries, false);
} else {
  const dir = path.join(process.cwd(), ".data");
  const names = (await fs.readdir(dir).catch(() => [])).filter((n) => /^north-ledger.*\.json$/.test(n));
  if (names.length === 0) console.log("No ledgers found (no Supabase settings, and no files in .data).");
  for (const n of names) {
    const data = JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as { audit?: AuditEntry[] };
    report(n, data.audit ?? [], true); // the file keeps only the latest 300 entries
  }
}
console.log(`\n${bad ? `${bad} log(s) FAILED the check.` : `All intact. ${total} entries checked${legacy ? `, ${legacy} older entries are not protected (written before the chain).` : "."}`}`);
process.exit(bad ? 1 : 0);
