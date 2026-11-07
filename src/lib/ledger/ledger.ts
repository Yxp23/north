// Storage for the ledger. Today it is a JSON file (and memory for tests).
// A Supabase version can replace it later by implementing the same `Ledger` interface.
import { defaultLedgerData, upgradeLedgerData } from "./logic";
import type { LedgerData } from "./types";

export interface Ledger {
  read(): Promise<LedgerData>;
  /** Read, change, save as one step. Steps never overlap, so two taps can't spend the same money. */
  update<T>(change: (data: LedgerData) => T | Promise<T>): Promise<T>;
  /** Back to the starting demo state (keeps the connected PayPal). */
  reset(): Promise<void>;
}

// One lock per storage key, kept on globalThis so every bundle of the dev server shares it.
const g = globalThis as unknown as { __northLocks?: Map<string, Promise<unknown>> };
export function withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const locks = (g.__northLocks ??= new Map());
  const next = (locks.get(key) ?? Promise.resolve()).then(run, run);
  locks.set(key, next.catch(() => undefined));
  return next;
}

/** The same rules the database enforces, so memory, file and Supabase behave alike. */
export function assertValid(data: LedgerData) {
  const ids = new Set<string>();
  const attempts = new Set<string>();
  for (const p of data.purchases) {
    if (ids.has(p.id)) throw new Error(`Two purchases share the id ${p.id}`);
    if (attempts.has(p.attemptId)) throw new Error(`Two purchases share the attempt id ${p.attemptId}`);
    ids.add(p.id);
    attempts.add(p.attemptId);
  }
  const flagged = new Set<string>();
  for (const f of data.flaggedSellers) {
    if (flagged.has(f.domain)) throw new Error(`${f.domain} is already flagged`);
    flagged.add(f.domain);
  }
  const watched = new Set<string>();
  for (const w of data.priceWatch.watches) {
    if (watched.has(w.productId)) throw new Error(`${w.productId} is already watched`);
    watched.add(w.productId);
  }
  const noticeIds = new Set<string>();
  for (const n of data.priceWatch.notices) {
    if (noticeIds.has(n.id)) throw new Error(`Two price notices share the id ${n.id}`);
    noticeIds.add(n.id);
  }
  const waitingIds = new Set<string>();
  const waitingProducts = new Set<string>();
  for (const w of data.waitingList) {
    if (waitingIds.has(w.id)) throw new Error(`Two waiting-list items share the id ${w.id}`);
    waitingIds.add(w.id);
    if (w.status !== "waiting") continue;
    if (waitingProducts.has(w.productId)) throw new Error(`${w.productId} is already on the waiting list`);
    waitingProducts.add(w.productId);
  }
}

/** History is never erased: purchases and waiting-list items can change status, but not disappear. */
export function assertNoDeletes(before: LedgerData, after: LedgerData) {
  for (const p of before.purchases) if (!after.purchases.some((x) => x.id === p.id)) throw new Error(`A purchase (${p.id}) can't be deleted`);
  for (const f of before.flaggedSellers) if (!after.flaggedSellers.some((x) => x.domain === f.domain)) throw new Error(`A flagged seller (${f.domain}) can't be removed`);
  for (const w of before.waitingList) if (!after.waitingList.some((x) => x.id === w.id)) throw new Error(`A waiting-list item (${w.id}) can't be deleted`);
}

export abstract class LockedLedger implements Ledger {
  protected abstract lockKey: string;
  protected abstract load(): Promise<LedgerData | null>;
  protected abstract save(data: LedgerData): Promise<void>;

  constructor(protected readonly timeZone: string, protected readonly clock: () => Date = () => new Date()) {}

  private async loadOrCreate(): Promise<LedgerData> {
    const saved = await this.load();
    return saved ? upgradeLedgerData(saved) : defaultLedgerData(this.clock(), this.timeZone);
  }

  read() {
    return withLock(this.lockKey, () => this.loadOrCreate());
  }

  update<T>(change: (data: LedgerData) => T | Promise<T>): Promise<T> {
    return withLock(this.lockKey, async () => {
      const data = await this.loadOrCreate();
      const before = structuredClone(data);
      const out = await change(data); // if this throws, nothing is saved
      assertValid(data);
      assertNoDeletes(before, data);
      await this.save(data);
      return out;
    });
  }

  /** Back to the starting demo state. The connected PayPal stays, so you don't have to connect again. */
  reset() {
    return withLock(this.lockKey, async () => {
      const fresh = defaultLedgerData(this.clock(), this.timeZone);
      const old = await this.load();
      if (old?.paypalVault) fresh.paypalVault = old.paypalVault;
      await this.save(fresh);
    });
  }
}

let memoryCount = 0;
export class MemoryLedger extends LockedLedger {
  protected lockKey = `memory-${memoryCount++}`;
  private data: LedgerData | null = null;
  protected async load() {
    return this.data ? structuredClone(this.data) : null;
  }
  protected async save(data: LedgerData) {
    this.data = structuredClone(data);
  }
}
