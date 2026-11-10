import { describe, expect, it } from "vitest";
import { defaultLedgerData, summarize } from "../ledger/logic";
import { settleMoneyPlan } from "../ledger/logic";
import { applySetup, cancelPendingMoney, setupFinished } from "./setup";

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
});

// An account that already has buys: the normal timing. Stricter starts at once; looser starts tomorrow and the old number stays until then.
describe("setup on an account that already has buys", () => {
  const withBuy = () => {
    const d = fresh();
    d.purchases.push({ id: "p", attemptId: "a", productId: "x", name: "n", category: "c", imageUrl: "", amountCents: 100, currency: "USD", status: "paid", createdAt: NOW.toISOString(), overrodeWait: false, decisionCode: "ok" });
    return d;
  };
  const DAY = 24 * 60 * 60 * 1000;
  const later = new Date(NOW.getTime() + DAY + 1000);

  it("is never a red error: it answers ok", () => {
    const r = applySetup(withBuy(), { weeklyDollars: 100, protectedDollars: 0 }, NOW);
    expect(r.ok).toBe(true);
  });
  it("stricter changes (less each week, more set aside) start right away", () => {
    const d = withBuy();
    const r = applySetup(d, { weeklyDollars: 300, protectedDollars: 1500 }, NOW);
    expect(r).toMatchObject({ ok: true, weeklyBudgetCents: 30000, protectedCents: 150000, changed: true });
    expect(r.ok && r.pending).toBeUndefined();
    expect(d.weeklyBudgetCents).toBe(30000);
    expect(d.protectedCents).toBe(150000);
    expect(d.agentCheckpoint.pendingMoney).toBeNull();
  });
  it("looser changes (more each week, less set aside) wait one day, and the old numbers stay in force", () => {
    const d = withBuy();
    const r = applySetup(d, { weeklyDollars: 500, protectedDollars: 1000 }, NOW);
    expect(r).toMatchObject({ ok: true, weeklyBudgetCents: 40000, protectedCents: 120000, changed: true });
    expect(r.ok && r.message).toMatch(/starts tomorrow/);
    expect(d.weeklyBudgetCents).toBe(40000); // still the old number
    expect(d.protectedCents).toBe(120000);
    expect(d.agentCheckpoint.pendingMoney).toMatchObject({ weeklyBudgetCents: 50000, protectedCents: 100000 });
    expect(summarize(d, NOW).pendingMoney?.startsAt).toBe(new Date(NOW.getTime() + DAY).toISOString());
    expect(summarize(d, NOW).protectedCents).toBe(120000); // the Guardian still sees the old, safer number
  });
  it("after a day the looser numbers count, and a higher weekly amount can really be spent", () => {
    const d = withBuy();
    applySetup(d, { weeklyDollars: 600, protectedDollars: 1200 }, NOW);
    expect(settleMoneyPlan(d, new Date(NOW.getTime() + DAY - 1000))).toBe(false); // not yet
    expect(d.weeklyBudgetCents).toBe(40000);
    expect(settleMoneyPlan(d, later)).toBe(true);
    expect(d.weeklyBudgetCents).toBe(60000);
    expect(d.agentCheckpoint.pendingMoney).toBeNull();
    expect(summarize(d, later).leftCents).toBeGreaterThan(40000); // not capped by the old balance
  });
  it("a mix: the stricter number starts now, the looser one waits, each by its own rule", () => {
    const d = withBuy();
    applySetup(d, { weeklyDollars: 500, protectedDollars: 1500 }, NOW);
    expect(d.protectedCents).toBe(150000); // more set aside: now
    expect(d.weeklyBudgetCents).toBe(40000); // more each week: tomorrow
    expect(d.agentCheckpoint.pendingMoney).toMatchObject({ weeklyBudgetCents: 50000 });
    expect(d.agentCheckpoint.pendingMoney?.protectedCents).toBeUndefined();
  });
  it("asking for the same looser change again does not restart its day", () => {
    const d = withBuy();
    applySetup(d, { weeklyDollars: 500, protectedDollars: 1200 }, NOW);
    const first = d.agentCheckpoint.pendingMoney!.startsAt;
    const r = applySetup(d, { weeklyDollars: 500, protectedDollars: 1200 }, new Date(NOW.getTime() + 3600_000));
    expect(d.agentCheckpoint.pendingMoney!.startsAt).toBe(first);
    expect(r.ok && r.changed).toBe(false);
  });
  it("a stricter ask replaces a waiting looser one, and undo can only remove the wait", () => {
    const d = withBuy();
    applySetup(d, { weeklyDollars: 500, protectedDollars: 1200 }, NOW);
    applySetup(d, { weeklyDollars: 300, protectedDollars: 1200 }, NOW);
    expect(d.agentCheckpoint.pendingMoney).toBeNull();
    expect(d.weeklyBudgetCents).toBe(30000);
    applySetup(d, { weeklyDollars: 900, protectedDollars: 1200 }, NOW);
    expect(d.agentCheckpoint.pendingMoney).not.toBeNull();
    const out = cancelPendingMoney(d, NOW);
    expect(out.ok).toBe(true);
    expect(d.agentCheckpoint.pendingMoney).toBeNull();
    expect(d.weeklyBudgetCents).toBe(30000); // nothing looser happened
  });
  it("still refuses odd numbers", () => {
    const d = withBuy();
    expect(applySetup(d, { weeklyDollars: 0, protectedDollars: 10 }, NOW).ok).toBe(false);
  });
});

describe("who is already set up", () => {
  it("an account with PayPal saved and buys is already set up; a new account is not", () => {
    expect(setupFinished({ paypalSaved: true, purchases: [{}] })).toBe(true);
    expect(setupFinished({ paypalSaved: true, purchases: [] })).toBe(false);
    expect(setupFinished({ paypalSaved: false, purchases: [{}] })).toBe(false);
    expect(setupFinished({ paypalSaved: false, purchases: [] })).toBe(false);
  });
});
