// Storage for the ledger. Today it is a JSON file (and memory for tests).
// A Supabase version can replace it later by implementing the same `Ledger` interface.
import { defaultLedgerData } from "./logic";
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
function withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const locks = (g.__northLocks ??= new Map());
  const next = (locks.get(key) ?? Promise.resolve()).then(run, run);
  locks.set(key, next.catch(() => undefined));
  return next;
}

export abstract class LockedLedger implements Ledger {
  protected abstract lockKey: string;
  protected abstract load(): Promise<LedgerData | null>;
  protected abstract save(data: LedgerData): Promise<void>;

  constructor(protected readonly timeZone: string, protected readonly clock: () => Date = () => new Date()) {}

  private async loadOrCreate(): Promise<LedgerData> {
    return (await this.load()) ?? defaultLedgerData(this.clock(), this.timeZone);
  }

  read() {
    return withLock(this.lockKey, () => this.loadOrCreate());
  }

  update<T>(change: (data: LedgerData) => T | Promise<T>): Promise<T> {
    return withLock(this.lockKey, async () => {
      const data = await this.loadOrCreate();
      const out = await change(data); // if this throws, nothing is saved
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
