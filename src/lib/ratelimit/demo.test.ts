import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRateLimiter } from "./limiter";
import { demoAllowance, DEMO_LIMITS } from "./demo";
import { sharedAccountScale } from "./route";

describe("the public demo's cost limits", () => {
  it("gives each visitor their own hourly allowance (another visitor is not affected)", async () => {
    const l = new MemoryRateLimiter();
    for (let i = 0; i < DEMO_LIMITS.perVisitorPerHour.ai; i++) expect((await demoAllowance(l, "s:a", "ai")).ok).toBe(true);
    expect(await demoAllowance(l, "s:a", "ai")).toEqual({ ok: false, why: "visitor" });
    expect((await demoAllowance(l, "s:b", "ai")).ok).toBe(true);
  });
  it("has a daily cap for the whole demo, however many visitors", async () => {
    const l = new MemoryRateLimiter();
    for (let i = 0; i < 5; i++) expect((await demoAllowance(l, `s:${i}`, "ai", 1, 5)).ok).toBe(true);
    expect(await demoAllowance(l, "s:new", "ai", 1, 5)).toEqual({ ok: false, why: "day" });
  });
  it("counts AI calls and store reads separately", async () => {
    const l = new MemoryRateLimiter();
    for (let i = 0; i < DEMO_LIMITS.perVisitorPerHour.ai; i++) await demoAllowance(l, "s:a", "ai");
    expect((await demoAllowance(l, "s:a", "stores")).ok).toBe(true);
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("the shared practice account's own limits", () => {
  it("are bigger only for the practice account in the judges' deployment", () => {
    const env = { DEMO_USER_ID: "00000000-0000-4000-8000-000000000001" };
    expect(sharedAccountScale("00000000-0000-4000-8000-000000000001", env)).toBe(1); // not a deployed demo here
    expect(sharedAccountScale("someone-else", env)).toBe(1);
  });
  it("are 10 times bigger for the practice account, and only it, in the judges' deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DEMO_DEPLOYMENT", "1");
    const env = { DEMO_USER_ID: "00000000-0000-4000-8000-000000000001" };
    expect(sharedAccountScale("00000000-0000-4000-8000-000000000001", env)).toBe(10);
    expect(sharedAccountScale("00000000-0000-4000-8000-0000000000aa", env)).toBe(1);
    expect(sharedAccountScale("00000000-0000-4000-8000-000000000001", {})).toBe(1); // no practice account named: nobody is scaled
  });
});
