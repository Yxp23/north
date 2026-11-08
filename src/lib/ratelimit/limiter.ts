// Rate limits. Fixed windows, counted in the database in production (so they survive restarts and are shared by every
// server), in memory in development and tests. FAIL CLOSED: if the limiter itself breaks, the answer is "no".
import type { RpcClient } from "../ledger/supabase-ledger";

export interface RateLimiter {
  /** True if this hit is allowed. `key` names what is limited (a user and an action, an assistant, an address). */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, number>();
  constructor(private readonly clock: () => number = Date.now) {}

  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!(limit >= 1) || !(windowSeconds >= 1) || key.length < 1 || key.length > 200) return false;
    const start = Math.floor(this.clock() / 1000 / windowSeconds);
    const id = `${key}|${windowSeconds}|${start}`;
    for (const k of this.buckets.keys()) if (!k.endsWith(`|${start}`) && this.buckets.size > 5000) this.buckets.delete(k); // keep it small
    const hits = (this.buckets.get(id) ?? 0) + 1;
    this.buckets.set(id, hits);
    return hits <= limit;
  }
}

export class SupabaseRateLimiter implements RateLimiter {
  constructor(private readonly client: RpcClient) {}

  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const { data, error } = await this.client.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
      if (error) {
        console.error(`[security] the rate limiter could not run (${error.message}). Everything it guards is refused until it can. Has supabase/migrations/20261109000000_north_security_hardening.sql been run?`);
        return false;
      }
      return data === true;
    } catch {
      return false;
    }
  }
}
