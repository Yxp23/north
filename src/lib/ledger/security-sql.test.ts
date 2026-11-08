import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { newDatabase, pgRpc } from "../../../test/pg-harness";
import { checkout, type PayGateway } from "../checkout/checkout";
import { DemoStore } from "../store/demo-store";
import { entryHash, GENESIS, verifyChain } from "./audit-chain";
import { SupabaseLedger } from "./supabase-ledger";
import { SupabaseNonceStore } from "./supabase-nonces";
import { defaultLedgerData } from "./logic";
import { ledgerSeed, type Snapshot } from "./supabase-mapping";
import type { LedgerData } from "./types";

// The SECURITY rules the database itself enforces (real SQL, in-process Postgres). The app checks these too; here we
// call the database directly, the way a bug or an attacker with the secret key would, and it still says no.
let db: PGlite;
beforeAll(async () => {
  db = await newDatabase();
}, 60_000);
afterAll(async () => {
  await db.close();
});

const NOON = new Date("2026-11-04T17:00:00Z"); // Wednesday, 12:00 PM in New York
const TZ = "America/New_York";
const KEY = Buffer.from("a".repeat(32));
const rpc = () => pgRpc(db);
const ledgerFor = (uid: string, lockKey?: string) => new SupabaseLedger(rpc(), uid, TZ, () => NOON, KEY, lockKey);
const seed = () => ledgerSeed(defaultLedgerData(NOON, TZ));

async function load(uid: string) {
  const r = await rpc().rpc("ledger_load", { p_user_id: uid, p_seed: seed() });
  return r.data as Snapshot;
}
async function apply(uid: string, changes: object, version?: number) {
  const snap = await load(uid);
  return rpc().rpc("ledger_apply", { p_user_id: uid, p_expected_version: version ?? snap.user.version, p_changes: changes });
}
const row = (id: string, cents: number, over: object = {}) => ({
  id, attempt_id: `att-${id}`, product_id: "p", name: "Thing", category: "household", image_url: "/x.svg", amount_cents: cents,
  currency: "USD", status: "pending", created_at: NOON.toISOString(), paid_at: null, refunded_at: null, paypal_order_id: null,
  capture_id: null, paid_via: null, webhook_confirmed_at: null, overrode_wait: false, decision_code: "ok", failure_reason: null, ...over,
});
const counted = async (uid: string) =>
  Number((await db.query<{ n: string }>("select coalesce(sum(amount_cents),0) as n from public.purchases where user_id = $1 and status in ('pending','paid')", [uid])).rows[0].n);

describe("spent Guardian approvals (consume_approval_nonce)", () => {
  it("a nonce can be spent once, ever", async () => {
    const uid = randomUUID();
    await load(uid);
    const store = new SupabaseNonceStore(rpc());
    const exp = Date.now() + 120_000;
    expect(await store.consume("pur_a", uid, exp)).toBe(true);
    expect(await store.consume("pur_a", uid, exp)).toBe(false);
    expect(await store.consume("pur_b", uid, exp)).toBe(true);
  });

  it("five at once: exactly one wins", async () => {
    const uid = randomUUID();
    await load(uid);
    const stores = Array.from({ length: 5 }, () => new SupabaseNonceStore(rpc()));
    const results = await Promise.all(stores.map((s) => s.consume("pur_race", uid, Date.now() + 120_000)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("fails closed when the database errors (a nonce for a user that doesn't exist)", async () => {
    const store = new SupabaseNonceStore(rpc());
    await expect(store.consume("pur_x", randomUUID(), Date.now() + 1000)).rejects.toThrow();
  });

  it("is invisible and unusable to the publishable key", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.approval_nonces")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.consume_approval_nonce('x', gen_random_uuid(), now())")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});

// With the demo money, what is spendable equals the weekly budget, so the two walls trip together. This gives a user a big
// balance, so the weekly-budget wall is the only one in the way.
const rich = (uid: string) => apply(uid, { user: { base_balance_cents: 10_000_000 } });

describe("the database refuses money that breaks the walls (defence in depth)", () => {
  it("refuses a new purchase over the weekly budget, and saves NOTHING from that call", async () => {
    const uid = randomUUID();
    await rich(uid);
    const before = await load(uid);
    const r = await apply(uid, { purchases: [row("pur_big", 40_001)], audit: [], user: { time_zone: TZ } });
    expect(r.error?.message).toMatch(/guardrail: this would go over the weekly budget/);
    const after = await load(uid);
    expect(after.purchases).toHaveLength(0);
    expect(after.user.version).toBe(before.user.version); // the whole call rolled back, even the user update
  });

  it("allows a purchase that exactly uses the budget, then refuses one more cent", async () => {
    const uid = randomUUID();
    await rich(uid);
    expect((await apply(uid, { purchases: [row("pur_full", 40_000)] })).error).toBeNull();
    const r = await apply(uid, { purchases: [row("pur_cent", 1)] });
    expect(r.error?.message).toMatch(/weekly budget/);
    expect(await counted(uid)).toBe(40_000);
  });

  it("refuses a purchase that would use the protected rent-and-bills money, even inside the weekly budget", async () => {
    const uid = randomUUID();
    await load(uid);
    // Raise the weekly budget (as a bug might) so the budget wall is not the one that stops it.
    await apply(uid, { user: { weekly_budget_cents: 1_000_000 } });
    const r = await apply(uid, { purchases: [row("pur_rent", 40_001)] });
    expect(r.error?.message).toMatch(/guardrail: this would use protected money/);
    expect(await counted(uid)).toBe(0);
  });

  it("counts pending purchases (money that may have moved) but not refunded or failed ones", async () => {
    const uid = randomUUID();
    await rich(uid);
    await apply(uid, { purchases: [row("pur_1", 30_000, { status: "pending" }), row("pur_2", 9_000, { status: "failed" })] });
    expect((await apply(uid, { purchases: [row("pur_3", 10_001)] })).error?.message).toMatch(/weekly budget/);
    // Refunding the first frees its money.
    expect((await apply(uid, { purchases: [row("pur_1", 30_000, { status: "refunded", refunded_at: NOON.toISOString() })] })).error).toBeNull();
    expect((await apply(uid, { purchases: [row("pur_3", 10_001)] })).error).toBeNull();
  });

  it("a different week is a different budget (but the protected money is for good)", async () => {
    const uid = randomUUID();
    await rich(uid);
    const lastWeek = new Date(NOON.getTime() - 8 * 86_400_000).toISOString();
    expect((await apply(uid, { purchases: [row("pur_old", 40_000, { created_at: lastWeek, status: "paid" })] })).error).toBeNull();
    expect((await apply(uid, { purchases: [row("pur_new", 40_000)] })).error).toBeNull(); // this week is still empty
    expect((await apply(uid, { purchases: [row("pur_more", 1)] })).error?.message).toMatch(/weekly budget/);
    // Protected money does not reset each week: take the balance down to protected + $1 and a $2 buy is refused.
    const poor = randomUUID();
    await apply(poor, { user: { base_balance_cents: 120_100, weekly_budget_cents: 1_000_000 } });
    expect((await apply(poor, { purchases: [row("pur_p1", 200, { created_at: lastWeek })] })).error?.message).toMatch(/protected money/);
  });

  it("updating an existing purchase (a webhook marks it paid, a refund) is not blocked by the new-purchase check", async () => {
    const uid = randomUUID();
    await apply(uid, { purchases: [row("pur_ok", 40_000)] });
    expect((await apply(uid, { purchases: [row("pur_ok", 40_000, { status: "paid", paid_at: NOON.toISOString(), paid_via: "webhook" })] })).error).toBeNull();
  });
});

describe("10 buys at once (race safety)", () => {
  const SNEAKERS = "OpovWAw"; // $72.54: five fit in a $400 week (362.70), a sixth does not
  const CLIPS = "912yTCL"; // $1.93

  function world(userId: string) {
    const charge = vi.fn<PayGateway["charge"]>(async (a) => ({ ok: true, orderId: `ORD-${a.customId}`, captureId: `CAP-${a.customId}`, status: "COMPLETED" }));
    let n = 0;
    const buyer = () => {
      // Each buyer is its own "server": its own ledger object and its own lock, sharing only the database.
      const ledger = ledgerFor(userId, `buyer-${randomUUID()}`);
      return (productId: string, i: number) =>
        checkout(
          { productId, attemptId: `race-${productId}-${i}`, overrideWait: true },
          { userId, signer: { key: KEY, now: () => NOON.getTime() }, ledger, store: new DemoStore(), gateway: { charge }, getVaultId: async () => "V", now: () => NOON, newId: () => `pur_${userId.slice(0, 8)}_${++n}` },
        );
    };
    return { charge, buyer };
  }

  it("ten $72.54 buys at the same moment: only the ones that fit are paid", async () => {
    const uid = randomUUID();
    await ledgerFor(uid).read();
    const { charge, buyer } = world(uid);
    const outs = await Promise.all(Array.from({ length: 10 }, (_, i) => buyer()(SNEAKERS, i)));
    const paid = outs.filter((o) => o.kind === "paid");
    const refused = outs.filter((o) => o.kind === "refused");
    expect(paid).toHaveLength(5);
    expect(refused).toHaveLength(5);
    expect(charge).toHaveBeenCalledTimes(5);
    expect(await counted(uid)).toBe(5 * 7254);
    expect(await counted(uid)).toBeLessThanOrEqual(40_000);
  }, 60_000);

  it("twelve small buys at the same moment all go through (nothing is lost to the retries)", async () => {
    const uid = randomUUID();
    await ledgerFor(uid).read();
    const { charge, buyer } = world(uid);
    const outs = await Promise.all(Array.from({ length: 12 }, (_, i) => buyer()(CLIPS, i)));
    expect(outs.map((o) => o.kind)).toEqual(Array(12).fill("paid"));
    expect(charge).toHaveBeenCalledTimes(12);
    expect(await counted(uid)).toBe(12 * 193);
  }, 60_000);

  it("a mix of sizes at the same moment never goes over the week", async () => {
    const uid = randomUUID();
    await ledgerFor(uid).read();
    const { buyer } = world(uid);
    await Promise.all(Array.from({ length: 10 }, (_, i) => buyer()(i % 2 ? SNEAKERS : CLIPS, i)));
    expect(await counted(uid)).toBeLessThanOrEqual(40_000);
  }, 60_000);

  it("the same tap sent ten times at once charges once", async () => {
    const uid = randomUUID();
    await ledgerFor(uid).read();
    const { charge, buyer } = world(uid);
    const outs = await Promise.all(Array.from({ length: 10 }, () => buyer()(CLIPS, 0)));
    expect(charge).toHaveBeenCalledTimes(1);
    expect(outs.filter((o) => o.kind === "paid").length).toBeGreaterThanOrEqual(1);
    expect(await counted(uid)).toBe(193);
  }, 60_000);
});

describe("the audit log is append-only and chained", () => {
  const sealed = (n: number, start = GENESIS) => {
    let prev = start;
    return Array.from({ length: n }, (_, i) => {
      const at = new Date(NOON.getTime() + i * 1000).toISOString();
      const hash = entryHash(prev, { at, type: "t", detail: `d${i}` }, KEY);
      const e = { at, type: "t", detail: `d${i}`, prev_hash: prev, hash };
      prev = hash;
      return e;
    });
  };

  it("accepts a correctly linked entry and continues the chain across saves", async () => {
    const uid = randomUUID();
    const [a, b, c] = sealed(3);
    expect((await apply(uid, { audit: [a, b] })).error).toBeNull();
    expect((await apply(uid, { audit: [c] })).error).toBeNull();
  });

  it("refuses an entry with no link, a wrong link, or a gap", async () => {
    const uid = randomUUID();
    const [a, b, c] = sealed(3);
    expect((await apply(uid, { audit: [{ at: a.at, type: "t", detail: "d" }] })).error?.message).toMatch(/audit chain broken/);
    expect((await apply(uid, { audit: [{ ...a, prev_hash: "something-else" }] })).error?.message).toMatch(/audit chain broken/);
    expect((await apply(uid, { audit: [a] })).error).toBeNull();
    expect((await apply(uid, { audit: [c] })).error?.message).toMatch(/audit chain broken/); // skipped b
    expect((await apply(uid, { audit: [b, c] })).error).toBeNull();
  });

  it("refuses UPDATE, DELETE and TRUNCATE, even for the secret key and the table owner", async () => {
    const uid = randomUUID();
    await apply(uid, { audit: sealed(2) });
    for (const role of ["service_role", null]) {
      if (role) await db.exec(`set role ${role}`);
      try {
        await expect(db.query("update public.audit_log set detail = 'edited' where user_id = $1", [uid])).rejects.toThrow(/append-only/);
        await expect(db.query("delete from public.audit_log where user_id = $1", [uid])).rejects.toThrow(/append-only/);
        await expect(db.query("delete from public.audit_log")).rejects.toThrow(/append-only/);
      } finally {
        if (role) await db.exec("reset role");
      }
    }
    await expect(db.exec("truncate public.audit_log")).rejects.toThrow(/append-only/);
    expect((await db.query("select 1 from public.audit_log where user_id = $1", [uid])).rows).toHaveLength(2);
  });

  it("the demo 'Start over' may clear it, and deleting a whole user takes their log with them", async () => {
    const uid = randomUUID();
    await apply(uid, { audit: sealed(2) });
    expect((await rpc().rpc("ledger_reset", { p_user_id: uid, p_seed: seed() })).error).toBeNull();
    expect((await db.query("select 1 from public.audit_log where user_id = $1", [uid])).rows).toHaveLength(0);
    await apply(uid, { audit: sealed(1) });
    await db.query("delete from public.users where id = $1", [uid]);
    expect((await db.query("select 1 from public.audit_log where user_id = $1", [uid])).rows).toHaveLength(0);
  });

  it("the app's saves link up, and the verifier catches an edit made behind its back", async () => {
    const uid = randomUUID();
    const l = ledgerFor(uid);
    for (let i = 0; i < 4; i++) await l.update((d: LedgerData) => void d.audit.push({ at: new Date(NOON.getTime() + i * 1000).toISOString(), type: "t", detail: `real ${i}` }));
    const readAll = async () => {
      const r = await db.query<{ at: Date; type: string; detail: string; prev_hash: string | null; hash: string | null }>(
        "select at, type, detail, prev_hash, hash from public.audit_log where user_id = $1 order by id", [uid]);
      return r.rows.map((x) => ({ at: x.at.toISOString(), type: x.type, detail: x.detail, ...(x.hash ? { prevHash: x.prev_hash!, hash: x.hash } : {}) }));
    };
    expect(verifyChain(await readAll(), KEY)).toMatchObject({ ok: true, checked: 4 });
    // Someone with database access gets around the trigger (as the table owner, they can disable it) and edits an entry.
    await db.exec("alter table public.audit_log disable trigger audit_log_no_edit_delete");
    await db.query("update public.audit_log set detail = 'forged' where user_id = $1 and detail = 'real 2'", [uid]);
    await db.exec("alter table public.audit_log enable trigger audit_log_no_edit_delete");
    expect(verifyChain(await readAll(), KEY)).toMatchObject({ ok: false, badIndex: 2 });
  });
});

describe("persistent rate limits (rate_limit_hit)", () => {
  const hit = async (key: string, limit: number, secs = 60) => {
    const r = await rpc().rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: secs });
    if (r.error) throw new Error(r.error.message);
    return r.data as boolean;
  };

  it("allows up to the limit in a window, then says no", async () => {
    const key = `k-${randomUUID()}`;
    expect([await hit(key, 3), await hit(key, 3), await hit(key, 3), await hit(key, 3), await hit(key, 3)]).toEqual([true, true, true, false, false]);
  });

  it("keys are independent", async () => {
    const a = `k-${randomUUID()}`;
    const b = `k-${randomUUID()}`;
    await hit(a, 1);
    expect(await hit(a, 1)).toBe(false);
    expect(await hit(b, 1)).toBe(true);
  });

  it("fifty at once: exactly the limit gets through", async () => {
    const key = `k-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 50 }, () => hit(key, 7)));
    expect(results.filter(Boolean)).toHaveLength(7);
  });

  it("nonsense settings and over-long keys fail closed", async () => {
    expect(await hit(`k-${randomUUID()}`, 0)).toBe(false);
    expect(await hit(`k-${randomUUID()}`, 5, 0)).toBe(false);
    await expect(hit("x".repeat(300), 5)).rejects.toThrow();
  });

  it("the limit survives a new database connection (it lives in the database, not in memory)", async () => {
    const key = `k-${randomUUID()}`;
    await hit(key, 1);
    const fresh = pgRpc(db); // a different client object, as after a server restart
    const r = await fresh.rpc("rate_limit_hit", { p_key: key, p_limit: 1, p_window_seconds: 60 });
    expect(r.data).toBe(false);
  });
});

describe("a webhook event is handled once, for good", () => {
  it("a repeated event id is refused, and the rest of that save is rolled back", async () => {
    const uid = randomUUID();
    await apply(uid, { webhook_event_ids: ["WH-ONCE-1"] });
    await apply(uid, { purchases: [row("pur_wh", 500)] });
    const r = await apply(uid, { webhook_event_ids: ["WH-ONCE-1"], purchases: [row("pur_wh", 500, { status: "paid", paid_via: "webhook" })] });
    expect(r.error?.message).toMatch(/duplicate webhook event/);
    const status = await db.query<{ status: string }>("select status from public.purchases where id = 'pur_wh'");
    expect(status.rows[0].status).toBe("pending");
  });
});
