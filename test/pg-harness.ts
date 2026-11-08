// Runs the REAL Supabase migration in an in-process Postgres (PGlite), so the SQL is tested for real.
// Only the HTTP step between the app and Supabase is faked (rpc -> SQL).
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RpcClient } from "../src/lib/ledger/supabase-ledger";

const MIGRATIONS = path.resolve(__dirname, "../supabase/migrations");

export async function newDatabase(): Promise<PGlite> {
  const db = new PGlite();
  // Supabase already has these roles. A bare Postgres doesn't.
  // Since Supabase's 2026 change, NEW tables are NOT granted to these roles automatically, so we
  // grant nothing here either. If a migration forgets a GRANT, the tests fail like the real project did.
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

/**
 * Every call runs as the service_role, like a request with the secret key does on Supabase
 * (PostgREST switches to that role). So missing GRANTs show up as "permission denied" here too.
 */
export function pgRpc(db: PGlite, hooks: { beforeApply?: () => Promise<void> } = {}): RpcClient {
  const asServiceRole = <T>(run: (tx: Transaction) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return run(tx);
    });

  return {
    async rpc(fn, args) {
      try {
        if (fn === "ledger_load") {
          const r = await asServiceRole((tx) => tx.query<{ r: unknown }>("select public.ledger_load($1::uuid, $2::jsonb) as r", [args.p_user_id, JSON.stringify(args.p_seed)]));
          return { data: r.rows[0].r, error: null };
        }
        if (fn === "ledger_apply") {
          await hooks.beforeApply?.();
          const r = await asServiceRole((tx) => tx.query<{ r: unknown }>("select public.ledger_apply($1::uuid, $2::bigint, $3::jsonb) as r", [args.p_user_id, args.p_expected_version, JSON.stringify(args.p_changes)]));
          return { data: Number(r.rows[0].r), error: null };
        }
        if (fn === "ledger_reset") {
          await asServiceRole((tx) => tx.query("select public.ledger_reset($1::uuid, $2::jsonb)", [args.p_user_id, JSON.stringify(args.p_seed)]));
          return { data: null, error: null };
        }
        if (fn === "consume_approval_nonce") {
          const r = await asServiceRole((tx) => tx.query<{ r: boolean }>("select public.consume_approval_nonce($1::text, $2::uuid, $3::timestamptz) as r", [args.p_nonce, args.p_user_id, args.p_expires_at]));
          return { data: r.rows[0].r, error: null };
        }
        if (fn === "approval_nonce_spent") {
          const r = await asServiceRole((tx) => tx.query<{ r: boolean }>("select public.approval_nonce_spent($1::text) as r", [args.p_nonce]));
          return { data: r.rows[0].r, error: null };
        }
        if (fn === "rate_limit_hit") {
          const r = await asServiceRole((tx) => tx.query<{ r: boolean }>("select public.rate_limit_hit($1::text, $2::int, $3::int) as r", [args.p_key, args.p_limit, args.p_window_seconds]));
          return { data: r.rows[0].r, error: null };
        }
        return { data: null, error: { message: `unknown function ${fn}` } };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },
  };
}
