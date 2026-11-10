// The ledger in Supabase Postgres. Server-only: it uses the SECRET key, which bypasses
// Row Level Security. The browser never sees it and never talks to Supabase.
//
// Reads and writes go through three SQL functions (see supabase/migrations). Writes are all-or-nothing
// and use a version number, so two servers can't overwrite each other: if someone else changed the
// user first, we reload and run the change again.
import "server-only";
import { subkey } from "../guardian/secret";
import { sealAudit } from "./audit-chain";
import { defaultLedgerData, settleMoneyPlan } from "./logic";
import { assertValid, withLock, type Ledger } from "./ledger";
import { diffChanges, fromSnapshot, ledgerSeed, type Snapshot } from "./supabase-mapping";
import type { LedgerData } from "./types";

/** The only part of the Supabase client we use. Tests give it a fake. */
export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

// Many buys at once (ten taps, or an assistant and a person) take turns: the one that saved first wins, the rest reload and decide again.
const MAX_TRIES = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SupabaseLedger implements Ledger {
  constructor(
    private readonly client: RpcClient,
    private readonly userId: string,
    private readonly timeZone: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly auditKey: Buffer = subkey("audit"),
    /** Tests give each ledger its own lock to act like separate servers. Normally one ledger per user per server shares one. */
    private readonly lockKey = `supabase-${userId}`,
  ) {}

  private seed() {
    return ledgerSeed(defaultLedgerData(this.clock(), this.timeZone));
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new Error(`Supabase ${fn} failed: ${error.message}`);
    return data as T;
  }

  private async load(): Promise<{ data: LedgerData; version: number }> {
    return fromSnapshot(await this.call<Snapshot>("ledger_load", { p_user_id: this.userId, p_seed: this.seed() }));
  }

  async read(): Promise<LedgerData> {
    const { data } = await this.load();
    settleMoneyPlan(data, new Date()); // a money change whose day has passed counts now (it is saved by the next change)
    return data;
  }

  update<T>(change: (data: LedgerData) => T | Promise<T>): Promise<T> {
    // One at a time inside this server; the version check covers other servers.
    return withLock(this.lockKey, async () => {
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        const { data, version } = await this.load();
        const before = structuredClone(data);
        settleMoneyPlan(data, new Date()); // after the copy, so the folded numbers are saved with whatever this change is
        const result = await change(data); // if this throws, nothing is saved
        assertValid(data);
        sealAudit(data.audit, this.auditKey); // each new audit entry gets its tamper-evident link (the database checks the links)
        const changes = diffChanges(before, data);
        if (!changes) return result;

        const newVersion = await this.call<number>("ledger_apply", {
          p_user_id: this.userId,
          p_expected_version: version,
          p_changes: changes,
        });
        if (newVersion >= 0) return result;
        await sleep(5 + Math.random() * Math.min(250, 15 * attempt)); // someone else saved first: reload and run the change again
      }
      throw new Error("The ledger is busy. Please try again.");
    });
  }

  async reset(): Promise<void> {
    await this.call("ledger_reset", { p_user_id: this.userId, p_seed: this.seed() });
  }
}
