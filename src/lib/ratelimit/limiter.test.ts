import { describe, expect, it } from "vitest";
import { MemoryRateLimiter, SupabaseRateLimiter } from "./limiter";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit in a window, then says no, then allows again in the next window", async () => {
    let t = 1_000_000;
    const l = new MemoryRateLimiter(() => t);
    const hits = async () => [await l.allow("a", 2, 60), await l.allow("a", 2, 60), await l.allow("a", 2, 60)];
    expect(await hits()).toEqual([true, true, false]);
    t += 61_000;
    expect(await hits()).toEqual([true, true, false]);
  });
  it("keeps keys apart", async () => {
    const l = new MemoryRateLimiter();
    await l.allow("a", 1, 60);
    expect(await l.allow("a", 1, 60)).toBe(false);
    expect(await l.allow("b", 1, 60)).toBe(true);
  });
  it("nonsense settings fail closed", async () => {
    const l = new MemoryRateLimiter();
    expect(await l.allow("a", 0, 60)).toBe(false);
    expect(await l.allow("a", 5, 0)).toBe(false);
    expect(await l.allow("", 5, 60)).toBe(false);
    expect(await l.allow("x".repeat(201), 5, 60)).toBe(false);
  });
});

describe("SupabaseRateLimiter", () => {
  it("passes the database's answer through", async () => {
    const yes = new SupabaseRateLimiter({ rpc: async () => ({ data: true, error: null }) });
    const no = new SupabaseRateLimiter({ rpc: async () => ({ data: false, error: null }) });
    expect(await yes.allow("k", 1, 60)).toBe(true);
    expect(await no.allow("k", 1, 60)).toBe(false);
  });
  it("fails closed on a database error or a throw", async () => {
    expect(await new SupabaseRateLimiter({ rpc: async () => ({ data: true, error: { message: "down" } }) }).allow("k", 1, 60)).toBe(false);
    expect(await new SupabaseRateLimiter({ rpc: async () => { throw new Error("network"); } }).allow("k", 1, 60)).toBe(false);
    expect(await new SupabaseRateLimiter({ rpc: async () => ({ data: null, error: null }) }).allow("k", 1, 60)).toBe(false);
  });
});
