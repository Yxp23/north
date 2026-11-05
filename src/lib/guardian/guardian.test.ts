import { describe, expect, it } from "vitest";
import { decide, type BigBuyRule, type LateNightRule, type Purchase, type Rules, type Strength, type UserState } from "./index";

// ---- helpers -------------------------------------------------------------
// All money is in whole cents. All times are UTC unless a test says otherwise.

const NOW = new Date("2026-11-05T15:00:00Z"); // 3 PM UTC
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

const big = (cents: number, strength: Strength = "gentle", waitHours?: number): BigBuyRule => ({ cents, strength, waitHours });
const late = (afterHour: number, untilHour: number, strength: Strength = "gentle", waitHours?: number): LateNightRule => ({ afterHour, untilHour, strength, waitHours });

/** A rule that has been in place for a long time (the normal case). */
const settled = <T>(value: T) => ({ value, changedAt: hoursAgo(24 * 30), previous: null as T | null });

function makeRules(over: Partial<Rules> = {}): Rules {
  return {
    waitOverCents: settled(big(5000)), // wait on buys over $50.00
    waitAfterHour: settled(late(22, 5)), // wait from 10 PM to 5 AM
    essentials: settled(["groceries", "medicine"]),
    ...over,
  };
}

function makeState(over: Partial<UserState> = {}): UserState {
  return {
    balanceCents: 100_000, // $1,000.00 in the account
    protectedCents: 60_000, // $600.00 for rent and bills
    weeklyBudgetCents: 10_000, // $100.00 a week
    spentThisWeekCents: 0,
    timeZone: "UTC",
    rules: makeRules(),
    ...over,
  };
}

function makePurchase(over: Partial<Purchase> = {}): Purchase {
  return {
    amountCents: 2000,
    item: "Wool socks",
    category: "clothes",
    at: NOW,
    ...over,
  };
}

const at = (iso: string) => new Date(iso);

// ---- approve -------------------------------------------------------------
describe("plain approvals", () => {
  it("approves a small buy during the day", () => {
    const r = decide(makePurchase(), makeState());
    expect(r.decision).toBe("approve");
    expect(r.code).toBe("ok");
    expect(r.canOverride).toBe(false); // nothing to override
  });

  it("gives a short reason for every decision", () => {
    for (const r of [
      decide(makePurchase(), makeState()),
      decide(makePurchase({ amountCents: 9000 }), makeState()),
      decide(makePurchase({ amountCents: 999_999 }), makeState()),
    ]) {
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeLessThan(140);
    }
  });
});

// ---- weekly budget -------------------------------------------------------
describe("weekly budget", () => {
  it("approves a buy that lands exactly on the budget", () => {
    // $100 budget, $40 spent, $60 buy: exactly $0 left. Wait rule is off for this test.
    const state = makeState({
      spentThisWeekCents: 4000,
      rules: makeRules({ waitOverCents: settled(null) }),
    });
    const r = decide(makePurchase({ amountCents: 6000 }), state);
    expect(r.decision).toBe("approve");
  });

  it("refuses a buy that is one cent over the budget", () => {
    const state = makeState({
      spentThisWeekCents: 4000,
      rules: makeRules({ waitOverCents: settled(null) }),
    });
    const r = decide(makePurchase({ amountCents: 6001 }), state);
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("over_budget");
    expect(r.canOverride).toBe(false);
  });

  it("refuses everything when the budget is already used up", () => {
    const state = makeState({ spentThisWeekCents: 10_000 });
    expect(decide(makePurchase({ amountCents: 1 }), state).decision).toBe("refuse");
  });

  it("an essential is still refused when it is over budget", () => {
    const state = makeState({ spentThisWeekCents: 9_900 });
    const r = decide(makePurchase({ category: "groceries", amountCents: 500 }), state);
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("over_budget");
  });
});

// ---- protected money -----------------------------------------------------
describe("protected money (rent and bills)", () => {
  // Balance $1,000 - protected $600 = $400 that could ever be spent.
  const wide = makeState({
    weeklyBudgetCents: 1_000_000, // a huge budget, so only protected money can stop us
    rules: makeRules({ waitOverCents: settled(null) }),
  });

  it("approves a buy that leaves exactly the protected money untouched", () => {
    expect(decide(makePurchase({ amountCents: 40_000 }), wide).decision).toBe("approve");
  });

  it("refuses a buy that touches protected money by one cent", () => {
    const r = decide(makePurchase({ amountCents: 40_001 }), wide);
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("protected_money");
    expect(r.canOverride).toBe(false);
  });

  it("protected money wins when the buy is also over budget", () => {
    const state = makeState({ spentThisWeekCents: 9_999 });
    const r = decide(makePurchase({ amountCents: 50_000 }), state);
    expect(r.code).toBe("protected_money");
  });

  it("refuses when the balance is already below the protected amount", () => {
    const state = makeState({ balanceCents: 50_000, protectedCents: 60_000 });
    expect(decide(makePurchase({ amountCents: 1 }), state).code).toBe("protected_money");
  });

  it("an essential cannot touch protected money either", () => {
    const r = decide(makePurchase({ category: "medicine", amountCents: 40_001 }), wide);
    expect(r.code).toBe("protected_money");
  });
});

// ---- wait: big buys ------------------------------------------------------
describe("wait on big buys", () => {
  it("does not wait at exactly the limit", () => {
    expect(decide(makePurchase({ amountCents: 5000 }), makeState()).decision).toBe("approve");
  });

  it("waits one cent over the limit", () => {
    const r = decide(makePurchase({ amountCents: 5001 }), makeState());
    expect(r.decision).toBe("wait");
    expect(r.code).toBe("wait_big_buy");
    expect(r.canOverride).toBe(true);
    expect(r.reason).toBe("You asked me to wait on big buys. Wait, or buy now?");
  });

  it("does nothing when the big-buy rule is off", () => {
    const state = makeState({ rules: makeRules({ waitOverCents: settled(null) }) });
    expect(decide(makePurchase({ amountCents: 9000 }), state).decision).toBe("approve");
  });
});

// ---- wait: late at night -------------------------------------------------
describe("wait on late-night buys", () => {
  it("approves a small buy at 9:59 PM", () => {
    expect(decide(makePurchase({ at: at("2026-11-05T21:59:00Z") }), makeState()).decision).toBe("approve");
  });

  it("waits at exactly 10:00 PM", () => {
    const r = decide(makePurchase({ at: at("2026-11-05T22:00:00Z") }), makeState());
    expect(r.decision).toBe("wait");
    expect(r.code).toBe("wait_late_night");
    expect(r.canOverride).toBe(true);
  });

  it("waits at 11 PM and at 4:59 AM", () => {
    expect(decide(makePurchase({ at: at("2026-11-05T23:00:00Z") }), makeState()).decision).toBe("wait");
    expect(decide(makePurchase({ at: at("2026-11-06T04:59:00Z") }), makeState()).decision).toBe("wait");
  });

  it("approves again at 5:00 AM", () => {
    expect(decide(makePurchase({ at: at("2026-11-06T05:00:00Z") }), makeState()).decision).toBe("approve");
  });

  it("uses the user's own clock, not UTC", () => {
    // 04:00 UTC on Nov 5 is 11:00 PM on Nov 4 in New York (EST).
    const p = makePurchase({ at: at("2026-11-05T04:00:00Z") });
    expect(decide(p, makeState({ timeZone: "America/New_York" })).decision).toBe("wait");
    // And a moment that is daytime in New York:
    const noonNy = makePurchase({ at: at("2026-11-05T17:00:00Z") }); // 12:00 PM EST
    expect(decide(noonNy, makeState({ timeZone: "America/New_York" })).decision).toBe("approve");
  });

  it("handles a window that does not cross midnight", () => {
    const state = makeState({
      rules: makeRules({ waitAfterHour: settled(late(1, 5)) }),
    });
    expect(decide(makePurchase({ at: at("2026-11-05T02:00:00Z") }), state).decision).toBe("wait");
    expect(decide(makePurchase({ at: at("2026-11-05T23:00:00Z") }), state).decision).toBe("approve");
  });
});

// ---- essentials ----------------------------------------------------------
describe("essentials never wait", () => {
  const night = at("2026-11-05T23:00:00Z"); // 11 PM

  it("approves an essential at 11 PM", () => {
    const r = decide(makePurchase({ category: "groceries", at: night }), makeState());
    expect(r.decision).toBe("approve");
    expect(r.code).toBe("ok_essential");
  });

  it("approves a big essential buy (over the limit)", () => {
    const r = decide(makePurchase({ category: "medicine", amountCents: 8000 }), makeState());
    expect(r.decision).toBe("approve");
  });

  it("a non-essential at 11 PM still waits", () => {
    expect(decide(makePurchase({ category: "clothes", at: night }), makeState()).decision).toBe("wait");
  });

  it("matches the category ignoring capital letters and spaces", () => {
    const r = decide(makePurchase({ category: "  Groceries ", at: night }), makeState());
    expect(r.code).toBe("ok_essential");
  });

  it("is decided by the user's list, not by words in the item title", () => {
    // A listing cannot talk its way onto the essentials list.
    const r = decide(
      makePurchase({ item: "ESSENTIAL groceries medicine", category: "gadgets", at: night }),
      makeState(),
    );
    expect(r.decision).toBe("wait");
  });
});

// ---- both wait rules -----------------------------------------------------
describe("big buy at night", () => {
  it("waits once and names both reasons", () => {
    const r = decide(
      makePurchase({ amountCents: 9000, at: at("2026-11-05T23:00:00Z") }),
      makeState(),
    );
    expect(r.decision).toBe("wait");
    expect(r.code).toBe("wait_big_buy_late_night");
    expect(r.reason).toContain("big");
    expect(r.reason).toContain("late");
    expect(r.canOverride).toBe(true);
  });
});

// ---- 24-hour delay on rule changes --------------------------------------
describe("a changed rule waits 24 hours", () => {
  it("a brand-new wait rule added 23 hours ago does not apply yet", () => {
    const state = makeState({
      rules: makeRules({ waitOverCents: { value: big(5000), changedAt: hoursAgo(23), previous: null } }),
    });
    expect(decide(makePurchase({ amountCents: 9000 }), state).decision).toBe("approve");
  });

  it("a rule changed 24 hours ago does apply", () => {
    const state = makeState({
      rules: makeRules({ waitOverCents: { value: big(5000), changedAt: hoursAgo(24), previous: null } }),
    });
    expect(decide(makePurchase({ amountCents: 9000 }), state).decision).toBe("wait");
  });

  it("loosening a limit 23 hours ago keeps the old, stricter limit", () => {
    // Was: wait over $50. Changed to: wait over $200. Not in effect yet.
    const state = makeState({
      rules: makeRules({ waitOverCents: { value: big(20_000), changedAt: hoursAgo(23), previous: big(5000) } }),
    });
    expect(decide(makePurchase({ amountCents: 9000 }), state).decision).toBe("wait");
  });

  it("loosening a limit 25 hours ago uses the new limit", () => {
    const state = makeState({
      rules: makeRules({ waitOverCents: { value: big(20_000), changedAt: hoursAgo(25), previous: big(5000) } }),
    });
    expect(decide(makePurchase({ amountCents: 9000 }), state).decision).toBe("approve");
  });

  it("turning a rule off 23 hours ago does not turn it off yet", () => {
    const state = makeState({
      rules: makeRules({ waitOverCents: { value: null, changedAt: hoursAgo(23), previous: big(5000) } }),
    });
    expect(decide(makePurchase({ amountCents: 9000 }), state).decision).toBe("wait");
  });

  it("a late-night rule changed 23 hours ago keeps the old hours", () => {
    const buyAt = at("2026-11-05T22:30:00Z");
    const state = makeState({
      rules: makeRules({
        // New hours would start at 11 PM. Old hours started at 10 PM.
        waitAfterHour: {
          value: late(23, 5),
          changedAt: new Date(buyAt.getTime() - 23 * 3600_000), // 23 hours before the purchase
          previous: late(22, 5),
        },
      }),
    });
    expect(decide(makePurchase({ at: buyAt }), state).decision).toBe("wait");
  });

  it("adding an item to the essentials list 23 hours ago does not count yet", () => {
    const buyAt = at("2026-11-05T23:00:00Z");
    const state = makeState({
      rules: makeRules({
        essentials: {
          value: ["groceries", "medicine", "gadgets"],
          changedAt: new Date(buyAt.getTime() - 23 * 3600_000), // 23 hours before the purchase
          previous: ["groceries", "medicine"],
        },
      }),
    });
    const r = decide(makePurchase({ category: "gadgets", at: buyAt }), state);
    expect(r.decision).toBe("wait");
  });
});

// ---- Buy now (override) --------------------------------------------------
describe("Buy now", () => {
  const lateBig = makePurchase({ amountCents: 9000, at: at("2026-11-05T23:00:00Z") });

  it("overrides a wait", () => {
    const r = decide({ ...lateBig, overrideWait: true }, makeState());
    expect(r.decision).toBe("approve");
    expect(r.code).toBe("ok_override");
    expect(r.overridden).toBe(true);
  });

  it("cannot override a refuse for protected money", () => {
    const r = decide(makePurchase({ amountCents: 40_001, overrideWait: true }), makeState({ weeklyBudgetCents: 1_000_000 }));
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("protected_money");
    expect(r.overridden).toBe(false);
  });

  it("cannot override a refuse for going over budget", () => {
    const state = makeState({ spentThisWeekCents: 9_000, rules: makeRules({ waitOverCents: settled(null) }) });
    const r = decide(makePurchase({ amountCents: 1_001, overrideWait: true }), state);
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("over_budget");
  });

  it("changes nothing when there was no wait", () => {
    const r = decide(makePurchase({ overrideWait: true }), makeState());
    expect(r.decision).toBe("approve");
    expect(r.code).toBe("ok");
    expect(r.overridden).toBe(false);
  });

  it("a wait is still a wait without the override", () => {
    expect(decide(lateBig, makeState()).decision).toBe("wait");
  });
});

// ---- bad input -----------------------------------------------------------
describe("bad input is refused", () => {
  it.each([0, -500, 12.5, NaN, Infinity])("refuses an amount of %s", (amountCents) => {
    const r = decide(makePurchase({ amountCents }), makeState());
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("bad_amount");
    expect(r.canOverride).toBe(false);
  });

  it("refuses a bad override even if the amount is wrong", () => {
    expect(decide(makePurchase({ amountCents: -1, overrideWait: true }), makeState()).decision).toBe("refuse");
  });

  it("refuses an invalid date instead of guessing the hour", () => {
    const r = decide(makePurchase({ at: new Date("not a date") }), makeState());
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("bad_input");
  });

  it("refuses an unknown time zone instead of guessing", () => {
    const r = decide(makePurchase(), makeState({ timeZone: "Mars/Olympus" }));
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("bad_input");
  });
});

// ---- purity --------------------------------------------------------------
describe("purity", () => {
  it("does not change its inputs and gives the same answer twice", () => {
    const purchase = makePurchase({ amountCents: 9000, at: at("2026-11-05T23:00:00Z") });
    const state = makeState();
    const before = JSON.stringify({ purchase, state });
    const a = decide(purchase, state);
    const b = decide(purchase, state);
    expect(JSON.stringify({ purchase, state })).toBe(before);
    expect(a).toEqual(b);
  });
});
