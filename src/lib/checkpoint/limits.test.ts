import { describe, expect, it } from "vitest";
import { createAgentLimiter } from "./limits";

describe("rate limits per assistant", () => {
  it("lets some through, then stops that assistant for a while", () => {
    const l = createAgentLimiter({ perMinute: 3, perHour: 100 }, () => 0);
    expect([1, 2, 3, 4].map(() => l.allow("a"))).toEqual([true, true, true, false]);
  });
  it("one assistant's use doesn't use up another's", () => {
    const l = createAgentLimiter({ perMinute: 1, perHour: 100 }, () => 0);
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(false);
    expect(l.allow("b")).toBe(true);
  });
  it("opens again after the minute", () => {
    let t = 0;
    const l = createAgentLimiter({ perMinute: 1, perHour: 100 }, () => t);
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(false);
    t = 61_000;
    expect(l.allow("a")).toBe(true);
  });
  it("also has an hourly cap", () => {
    let t = 0;
    const l = createAgentLimiter({ perMinute: 100, perHour: 5 }, () => t);
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      t += 20_000;
      if (l.allow("a")) ok++;
    }
    expect(ok).toBe(5);
  });
  it("a refused try doesn't count against the assistant", () => {
    let t = 0;
    const l = createAgentLimiter({ perMinute: 2, perHour: 100 }, () => t);
    l.allow("a"); l.allow("a"); l.allow("a"); l.allow("a");
    t = 61_000;
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(true);
  });
});
