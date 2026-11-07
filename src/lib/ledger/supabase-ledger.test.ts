import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { newDatabase, pgRpc } from "../../../test/pg-harness";
import { ledgerContract } from "./ledger-contract";
import { SupabaseLedger } from "./supabase-ledger";
import { defaultLedgerData } from "./logic";
import { ledgerSeed } from "./supabase-mapping";

let db: PGlite;
beforeAll(async () => {
  db = await newDatabase();
}, 60_000);
afterAll(async () => {
  await db.close();
});

const clock = () => new Date("2026-11-04T15:00:00Z");

// The shared behavior tests, against the real SQL.
ledgerContract("Supabase (real SQL in PGlite)", async () => ({
  ledger: new SupabaseLedger(pgRpc(db), randomUUID(), "America/New_York", clock),
}));

describe("Supabase specifics", () => {
  it("applies the migration: all tables exist with RLS on and no policies", async () => {
    const t = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(t.rows.map((r) => r.relname)).toEqual(["audit_log", "flagged_sellers", "purchases", "rules", "users", "waiting_list", "webhook_events"]);
    expect(t.rows.every((r) => r.relrowsecurity)).toBe(true);
    const policies = await db.query(`select 1 from pg_policies where schemaname = 'public'`);
    expect(policies.rows).toHaveLength(0);
  });

  it("the publishable/anon key can't read tables or run the ledger functions", async () => {
    const uid = randomUUID();
    await new SupabaseLedger(pgRpc(db), uid, "UTC", clock).read(); // make a row to try to steal
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.users")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.purchases")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.ledger_load($1::uuid, '{}'::jsonb)", [uid])).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("the secret (service role) can run the ledger functions", async () => {
    await db.exec("set role service_role");
    try {
      const r = await db.query("select public.ledger_load($1::uuid, $2::jsonb) as r", [randomUUID(), JSON.stringify({ time_zone: "UTC", base_balance_cents: 1, protected_cents: 0, weekly_budget_cents: 1, rules: [] })]);
      expect(r.rows).toHaveLength(1);
    } finally {
      await db.exec("reset role");
    }
  });

  it("the secret key (service role) can read and write every table, including the audit_log id counter", async () => {
    const uid = randomUUID();
    await new SupabaseLedger(pgRpc(db), uid, "UTC", clock).read(); // creates the user
    await db.exec("set role service_role");
    try {
      for (const t of ["users", "rules", "purchases", "waiting_list", "audit_log", "webhook_events"]) {
        await expect(db.query(`select count(*) from public.${t}`)).resolves.toBeDefined();
      }
      await db.query("insert into public.audit_log (user_id, type, detail) values ($1, 't', 'd')", [uid]);
      await db.query("insert into public.webhook_events (event_id, user_id) values ($1, $2)", [`WH-${uid}`, uid]);
      await db.query("update public.users set display_name = 'x' where id = $1", [uid]);
      await db.query("delete from public.audit_log where user_id = $1", [uid]);
    } finally {
      await db.exec("reset role");
    }
  });

  it("rules are stored as versions with an effective_at 24 hours after the change", async () => {
    const uid = randomUUID();
    const l = new SupabaseLedger(pgRpc(db), uid, "America/New_York", clock);
    const changedAt = "2026-11-04T10:00:00.000Z";
    await l.update((d) => void (d.rules.waitOverCents = { value: { cents: 20_000, strength: "gentle" }, changedAt, previous: { cents: 5000, strength: "gentle" } }));
    const rows = await db.query<{ enabled: boolean; params: { cents?: number }; created_at: Date; effective_at: Date }>(
      `select enabled, params, created_at, effective_at from public.rules where user_id = $1 and kind = 'wait_over_amount' order by effective_at`,
      [uid],
    );
    expect(rows.rows).toHaveLength(2); // the starting rule, then the change
    expect(rows.rows[0].params).toEqual({ cents: 5000, strength: "gentle" });
    expect(rows.rows[1].params).toEqual({ cents: 20_000, strength: "gentle" });
    expect(rows.rows[1].created_at.toISOString()).toBe(changedAt);
    expect(rows.rows[1].effective_at.toISOString()).toBe("2026-11-05T10:00:00.000Z");
  });

  it("unchanged data writes nothing (version stays put)", async () => {
    const uid = randomUUID();
    const l = new SupabaseLedger(pgRpc(db), uid, "UTC", clock);
    await l.read();
    const v = () => db.query<{ version: number }>("select version from public.users where id = $1", [uid]).then((r) => Number(r.rows[0].version));
    const before = await v();
    await l.update(() => undefined);
    expect(await v()).toBe(before);
    await l.update((d) => void (d.baseBalanceCents += 1));
    expect(await v()).toBe(before + 1);
  });

  it("when another server saves first, it reloads and runs the change again (no lost update)", async () => {
    const uid = randomUUID();
    let interfered = false;
    let runs = 0;
    const raw = pgRpc(db);
    const interfere = async () => {
      const snap = (await raw.rpc("ledger_load", { p_user_id: uid, p_seed: ledgerSeed(defaultLedgerData(clock(), "UTC")) })).data as { user: { version: number } };
      await raw.rpc("ledger_apply", { p_user_id: uid, p_expected_version: snap.user.version, p_changes: { user: { weekly_budget_cents: 999 } } });
    };
    const racing = new SupabaseLedger(
      {
        rpc: async (fn, args) => {
          if (fn === "ledger_apply" && !interfered) {
            interfered = true;
            await interfere();
          }
          return raw.rpc(fn, args);
        },
      },
      uid, "UTC", clock,
    );
    await racing.update((d) => {
      runs++;
      d.baseBalanceCents += 1;
    });
    const d = await racing.read();
    expect(runs).toBe(2); // the first try lost the race and was run again
    expect(d.weeklyBudgetCents).toBe(999); // the other server's change survived
    expect(d.baseBalanceCents).toBe(160_001); // and ours was applied on top
  });

  it("gives up with a clear error if the ledger stays busy", async () => {
    const uid = randomUUID();
    const raw = pgRpc(db);
    const busy = new SupabaseLedger(
      { rpc: async (fn, args) => (fn === "ledger_apply" ? { data: -1, error: null } : raw.rpc(fn, args)) },
      uid, "UTC", clock,
    );
    await expect(busy.update((d) => void (d.baseBalanceCents += 1))).rejects.toThrow(/busy/);
  }, 20_000);

  it("refuses to run against a database that has not had the latest migration (it would drop waiting-list items)", async () => {
    const raw = pgRpc(db);
    const old = new SupabaseLedger(
      {
        rpc: async (fn, args) => {
          const r = await raw.rpc(fn, args);
          if (fn === "ledger_load" && r.data) delete (r.data as Record<string, unknown>).waiting_list; // what the old function returned
          return r;
        },
      },
      randomUUID(), "UTC", clock,
    );
    await expect(old.read()).rejects.toThrow(/out of date.*20261105000000_north_rule_strength/);
    await expect(old.update(() => undefined)).rejects.toThrow(/out of date/);
  });

  it("refuses to run against a database without the flagged-sellers table (a flag would be silently lost)", async () => {
    const raw = pgRpc(db);
    const old = new SupabaseLedger(
      {
        rpc: async (fn, args) => {
          const r = await raw.rpc(fn, args);
          if (fn === "ledger_load" && r.data) delete (r.data as Record<string, unknown>).flagged_sellers;
          return r;
        },
      },
      randomUUID(), "UTC", clock,
    );
    await expect(old.read()).rejects.toThrow(/out of date.*20261106000000_north_flagged_sellers/);
  });

  it("refuses to run against a database without the price-watcher column (the news would be silently lost)", async () => {
    const raw = pgRpc(db);
    const old = new SupabaseLedger(
      {
        rpc: async (fn, args) => {
          const r = await raw.rpc(fn, args);
          if (fn === "ledger_load" && r.data) delete (r.data as { user: Record<string, unknown> }).user.price_watch;
          return r;
        },
      },
      randomUUID(), "UTC", clock,
    );
    await expect(old.read()).rejects.toThrow(/out of date.*20261107000000_north_price_watcher/);
  });

  it("reports a database error without hiding it", async () => {
    const bad = new SupabaseLedger({ rpc: async () => ({ data: null, error: { message: "boom" } }) }, randomUUID(), "UTC", clock);
    await expect(bad.read()).rejects.toThrow(/ledger_load failed: boom/);
  });

  it("purchases can change status but never amount or product", async () => {
    const uid = randomUUID();
    const l = new SupabaseLedger(pgRpc(db), uid, "UTC", clock);
    await l.update((d) =>
      void d.purchases.push({
        id: `pur_${randomUUID()}`, attemptId: "att-x-1", productId: "P", name: "N", category: "c", imageUrl: "https://x/y", amountCents: 250,
        currency: "USD", status: "pending", createdAt: "2026-11-04T10:00:00.000Z", overrodeWait: false, decisionCode: "ok",
      }),
    );
    await l.update((d) => {
      d.purchases[0].amountCents = 1; // someone tries to rewrite history
      d.purchases[0].productId = "OTHER";
      d.purchases[0].status = "paid";
    });
    const p = (await l.read()).purchases[0];
    expect(p.status).toBe("paid");
    expect(p.amountCents).toBe(250);
    expect(p.productId).toBe("P");
  });

  it("refuses to delete a purchase", async () => {
    const uid = randomUUID();
    const l = new SupabaseLedger(pgRpc(db), uid, "UTC", clock);
    await l.update((d) =>
      void d.purchases.push({
        id: `pur_${randomUUID()}`, attemptId: "att-d-1", productId: "P", name: "N", category: "c", imageUrl: "https://x/y", amountCents: 250,
        currency: "USD", status: "paid", createdAt: "2026-11-04T10:00:00.000Z", overrodeWait: false, decisionCode: "ok",
      }),
    );
    await expect(l.update((d) => void d.purchases.splice(0, 1))).rejects.toThrow(/can't be deleted/);
    expect((await l.read()).purchases).toHaveLength(1);
  });

  it("keeps each user's data apart", async () => {
    const a = new SupabaseLedger(pgRpc(db), randomUUID(), "UTC", clock);
    const b = new SupabaseLedger(pgRpc(db), randomUUID(), "UTC", clock);
    await a.update((d) => void (d.baseBalanceCents = 7));
    expect((await b.read()).baseBalanceCents).toBe(160_000);
  });
});
