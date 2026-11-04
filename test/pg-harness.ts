// Runs the REAL Supabase migration in an in-process Postgres (PGlite), so the SQL is tested for real.
// Only the HTTP step between the app and Supabase is faked (rpc -> SQL).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RpcClient } from "../src/lib/ledger/supabase-ledger";

const MIGRATION = path.resolve(__dirname, "../supabase/migrations/20261104000000_north_init.sql");

export async function newDatabase(): Promise<PGlite> {
  const db = new PGlite();
  // Supabase already has these roles. A bare Postgres doesn't.
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase grants these by default on new tables and functions. The migration then takes them back.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  return db;
}

export function pgRpc(db: PGlite, hooks: { beforeApply?: () => Promise<void> } = {}): RpcClient {
  return {
    async rpc(fn, args) {
      try {
        if (fn === "ledger_load") {
          const r = await db.query<{ r: unknown }>("select public.ledger_load($1::uuid, $2::jsonb) as r", [args.p_user_id, JSON.stringify(args.p_seed)]);
          return { data: r.rows[0].r, error: null };
        }
        if (fn === "ledger_apply") {
          await hooks.beforeApply?.();
          const r = await db.query<{ r: unknown }>("select public.ledger_apply($1::uuid, $2::bigint, $3::jsonb) as r", [args.p_user_id, args.p_expected_version, JSON.stringify(args.p_changes)]);
          return { data: Number(r.rows[0].r), error: null };
        }
        if (fn === "ledger_reset") {
          await db.query("select public.ledger_reset($1::uuid, $2::jsonb)", [args.p_user_id, JSON.stringify(args.p_seed)]);
          return { data: null, error: null };
        }
        return { data: null, error: { message: `unknown function ${fn}` } };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },
  };
}
