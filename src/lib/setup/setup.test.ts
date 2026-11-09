import { describe, expect, it } from "vitest";
import { defaultLedgerData, summarize } from "../ledger/logic";
import { applySetup } from "./setup";

const NOW = new Date("2026-11-04T15:00:00Z");
const fresh = () => defaultLedgerData(NOW, "America/New_York");

describe("first-run setup", () => {
  it("sets the weekly money and the rent-and-bills money, and the week's budget is the limit", () => {
    const d = fresh();
    const r = applySetup(d, { weeklyDollars: 250, protectedDollars: 900 }, NOW);
    expect(r).toEqual({ ok: true, weeklyBudgetCents: 25000, protectedCents: 90000 });
    const s = summarize(d, NOW);
    expect(s.leftCents).toBe(25000);
    expect(s.protectedCents).toBe(90000);
    expect(d.audit.at(-1)?.type).toBe("setup");
  });
  it("refuses odd numbers and changes nothing", () => {
    for (const bad of [{ weeklyDollars: 0, protectedDollars: 10 }, { weeklyDollars: -5, protectedDollars: 10 }, { weeklyDollars: "abc", protectedDollars: 10 }, { weeklyDollars: 99999, protectedDollars: 10 }, { weeklyDollars: 10, protectedDollars: -1 }]) {
      const d = fresh();
      const before = JSON.stringify(d);
      expect(applySetup(d, bad, NOW).ok).toBe(false);
      expect(JSON.stringify(d)).toBe(before);
    }
  });
  it("can't loosen protected money once there are buys", () => {
    const d = fresh();
    d.purchases.push({ id: "p", attemptId: "a", productId: "x", name: "n", category: "c", imageUrl: "", amountCents: 100, currency: "USD", status: "paid", createdAt: NOW.toISOString(), overrodeWait: false, decisionCode: "ok" });
    expect(applySetup(d, { weeklyDollars: 100, protectedDollars: 0 }, NOW).ok).toBe(false);
    expect(d.protectedCents).toBe(120000);
  });
});
