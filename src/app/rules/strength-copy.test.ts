import { describe, expect, it } from "vitest";
import { STRENGTH_COPY, whenPlain } from "./strength-copy";

describe("strength words", () => {
  it("each strength has one short line and an example for both kinds of rule", () => {
    for (const s of ["gentle", "firm", "locked"] as const) {
      const c = STRENGTH_COPY[s];
      expect(c.line.split(" ").length).toBeLessThanOrEqual(12);
      for (const k of ["big_buy", "late_night"] as const) {
        expect(c.example(k)).toMatch(/^You try to buy/);
        expect(c.example(k)).not.toMatch(/\$|\d/); // no number that could disagree with the person's own rule
      }
    }
  });
  it("says a change that starts after one day starts tomorrow", () => {
    const now = new Date("2026-11-09T15:00:00");
    expect(whenPlain(new Date(now.getTime() + 24 * 3_600_000).toISOString(), now)).toMatch(/^tomorrow at /);
    expect(whenPlain(new Date(now.getTime() + 2 * 3_600_000).toISOString(), now)).toMatch(/^today at /);
    expect(whenPlain(new Date(now.getTime() + 72 * 3_600_000).toISOString(), now)).toMatch(/ at /);
  });
});
