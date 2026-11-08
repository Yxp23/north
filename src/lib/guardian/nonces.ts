// "One time only": an approval's nonce can be spent once, ever. The memory store is for tests and development;
// production uses the database (ledger/supabase-nonces.ts), so a second server or a restart can't spend it again.
export interface NonceStore {
  /** True the first time a nonce is spent, false if it was spent before. Throws if it can't tell (then we refuse). */
  consume(nonce: string, userId: string, expiresAtMs: number): Promise<boolean>;
  /** Has this nonce been spent? Throws if it can't tell (then the caller refuses). */
  isSpent(nonce: string): Promise<boolean>;
}

export class MemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>();
  async consume(nonce: string, _userId: string, expiresAtMs: number): Promise<boolean> {
    const now = Date.now();
    for (const [n, exp] of this.seen) if (exp < now - 60_000) this.seen.delete(n); // forget old ones
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, expiresAtMs);
    return true;
  }
  async isSpent(nonce: string): Promise<boolean> {
    return this.seen.has(nonce);
  }
}
