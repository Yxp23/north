// Rule strength: gentle, firm and locked wait rules, and the hard walls that no strength can change.
import { describe, expect, it } from "vitest";
import { decide, type BigBuyRule, type LateNightRule, type Purchase, type Rules, type Strength, type UserState } from "./index";

const HOUR = 3_600_000;
const NOON = new Date("2026-11-05T12:00:00Z"); // 12:00 PM (UTC is the user's clock in these tests)
const TEN_PM = new Date("2026-11-05T22:00:00Z");
const hoursAfter = (d: Date, h: number) => new Date(d.getTime() + h * HOUR);
const hoursBefore = (d: Date, h: number) => new Date(d.getTime() - h * HOUR);

const settled = <T,>(value: T | null) => ({ value, changedAt: new Date("2026-10-01T00:00:00Z"), previous: null as T | null });
const big = (cents: number, strength: Strength, waitHours?: number): BigBuyRule => ({ cents, strength, waitHours });
const late = (afterHour: number, strength: Strength, waitHours?: number): LateNightRule => ({ afterHour, untilHour: 5, strength, waitHours });

type RuleSet = { big?: BigBuyRule | null; late?: LateNightRule | null; essentials?: string[] };
function stateWith(r: RuleSet, over: Partial<UserState> = {}): UserState {
  const rules: Rules = {
    waitOverCents: settled(r.big === undefined ? null : r.big),
    waitAfterHour: settled(r.late === undefined ? null : r.late),
    essentials: settled(r.essentials ?? ["groceries"]),
  };
  return {
    balanceCents: 160_000, protectedCents: 120_000, weeklyBudgetCents: 40_000, spentThisWeekCents: 0,
    timeZone: "UTC", rules, ...over,
  };
}
const buy = (over: Partial<Purchase> = {}): Purchase => ({ amountCents: 9000, item: "Headphones", category: "electronics", at: NOON, ...over });

// ---------------------------------------------------------------------------------------------
describe("gentle: Wait, or buy now?", () => {
  const state = stateWith({ big: big(5000, "gentle") });

  it("waits, and says so in plain words", () => {
    const r = decide(buy(), state);
    expect(r).toMatchObject({ decision: "wait", code: "wait_big_buy", canOverride: true });
    expect(r.reason).toBe("You asked me to wait on big buys. Wait, or buy now?");
  });

  it("Buy now works right away", () => {
    const r = decide(buy({ overrideWait: true }), state);
    expect(r).toMatchObject({ decision: "approve", code: "ok_override", overridden: true });
  });

  it("an override reports which rule it got past", () => {
    expect(decide(buy({ overrideWait: true }), state).overriddenRules).toEqual(["big_buy"]);
    const both = stateWith({ big: big(5000, "gentle"), late: late(22, "gentle") });
    expect(decide(buy({ at: TEN_PM, overrideWait: true }), both).overriddenRules).toEqual(["big_buy", "late_night"]);
  });

  it("no override is reported when there was nothing to override", () => {
    expect(decide(buy({ amountCents: 100, overrideWait: true }), state).overriddenRules).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("firm: saved for later, no Buy now today", () => {
  const nine = stateWith({ late: late(21, "firm") }); // "wait on buys after 9pm"

  it("puts a late-night buy on the waiting list, with the reminder", () => {
    const r = decide(buy({ amountCents: 1000, at: TEN_PM }), nine);
    expect(r).toMatchObject({ decision: "waitlist", code: "waitlist_late_night", canOverride: false, waitHours: 24 });
    expect(r.reason).toBe("You asked me to wait a day on buys after 9pm. I saved it. I'll remind you tomorrow.");
    expect(r.remindAt).toEqual(hoursAfter(TEN_PM, 24));
  });

  it("puts a firm big buy on the waiting list", () => {
    const r = decide(buy(), stateWith({ big: big(5000, "firm") }));
    expect(r).toMatchObject({ decision: "waitlist", code: "waitlist_big_buy", canOverride: false });
    expect(r.reason).toBe("You asked me to wait a day on big buys. I saved it. I'll remind you tomorrow.");
  });

  it("Buy now does nothing on a firm rule", () => {
    const r = decide(buy({ amountCents: 1000, at: TEN_PM, overrideWait: true }), nine);
    expect(r.decision).toBe("waitlist");
    expect(r.overridden).toBe(false);
    expect(r.overriddenRules).toEqual([]);
  });

  it("the wait can be set per rule (48 hours, 12 hours)", () => {
    const two = decide(buy({ at: TEN_PM, amountCents: 1000 }), stateWith({ late: late(21, "firm", 48) }));
    expect(two.waitHours).toBe(48);
    expect(two.remindAt).toEqual(hoursAfter(TEN_PM, 48));
    expect(two.reason).toBe("You asked me to wait 2 days on buys after 9pm. I saved it. I'll remind you in 2 days.");
    const half = decide(buy({ at: TEN_PM, amountCents: 1000 }), stateWith({ late: late(21, "firm", 12) }));
    expect(half.reason).toBe("You asked me to wait 12 hours on buys after 9pm. I saved it. I'll remind you in 12 hours.");
  });

  it("a big buy at night under two firm rules names both and waits the longer time", () => {
    const s = stateWith({ big: big(5000, "firm", 24), late: late(21, "firm", 48) });
    const r = decide(buy({ at: TEN_PM }), s);
    expect(r).toMatchObject({ decision: "waitlist", code: "waitlist_big_buy_late_night", waitHours: 48 });
    expect(r.reason).toBe("This is a big buy, and it is late. You asked me to wait 2 days on both. I saved it. I'll remind you in 2 days.");
  });

  it("firm beats gentle when both are triggered, so Buy now does not work", () => {
    const s = stateWith({ big: big(5000, "gentle"), late: late(21, "firm") });
    const r = decide(buy({ at: TEN_PM, overrideWait: true }), s);
    expect(r.decision).toBe("waitlist");
    expect(r.reason).toContain("buys after 9pm");
    expect(r.overridden).toBe(false);
  });

  it("a firm rule that is not triggered changes nothing", () => {
    expect(decide(buy({ amountCents: 1000, at: NOON }), nine).decision).toBe("approve");
  });

  describe("after the wait it is a normal buy", () => {
    const since = TEN_PM;
    const waited = (hours: number, over: Partial<Purchase> = {}) =>
      buy({ amountCents: 1000, at: hoursAfter(since, hours), waitlist: { since, waitHours: 24 }, ...over });

    it("is allowed at exactly 24 hours", () => {
      const r = decide(waited(24), nine);
      expect(r).toMatchObject({ decision: "approve", code: "ok_after_wait" });
      expect(r.reason).toBe("You waited, and I checked your money. It is okay to buy.");
    });

    it("is allowed after 24 hours even when it is late again (the wait was served)", () => {
      expect(decide(waited(24), nine).decision).toBe("approve"); // 10 PM the next night
    });

    it("still waits at 23 hours 59 minutes, and says when it will be ready", () => {
      const r = decide(waited(24 - 1 / 60), nine);
      expect(r).toMatchObject({ decision: "waitlist", code: "waitlist_not_yet", canOverride: false });
      expect(r.remindAt).toEqual(hoursAfter(since, 24));
      expect(r.reason).toBe("It is not time yet. I'll remind you tomorrow.");
    });

    it("Buy now still does not hurry a firm wait", () => {
      expect(decide(waited(5, { overrideWait: true }), nine).decision).toBe("waitlist");
    });

    it("is STILL refused after 24 hours if it is over the weekly budget", () => {
      // Plenty of spendable money, so only the weekly budget ($400) is in the way.
      const r = decide(waited(24, { amountCents: 40_001 }), stateWith({ late: late(21, "firm") }, { balanceCents: 500_000 }));
      expect(r).toMatchObject({ decision: "refuse", code: "over_budget" });
    });

    it("is STILL refused after 24 hours if it would touch protected money", () => {
      const s = stateWith({ late: late(21, "firm") }, { balanceCents: 121_000 }); // only $10 spendable
      expect(decide(waited(24, { amountCents: 1001 }), s)).toMatchObject({ decision: "refuse", code: "protected_money" });
    });

    it("uses the budget as it is now, so earlier spending counts", () => {
      const s = stateWith({ late: late(21, "firm") }, { spentThisWeekCents: 39_500 });
      expect(decide(waited(24, { amountCents: 1000 }), s).code).toBe("over_budget");
    });

    it("serving a wait does not get past a locked rule", () => {
      const s = stateWith({ big: big(5000, "locked"), late: late(21, "firm") });
      expect(decide(waited(48, { amountCents: 9000 }), s)).toMatchObject({ decision: "refuse", code: "locked_rule" });
    });

    it("serving the wait also satisfies a gentle rule", () => {
      const s = stateWith({ big: big(5000, "gentle"), late: late(21, "firm") });
      expect(decide(waited(24, { amountCents: 9000 }), s).code).toBe("ok_after_wait");
    });

    it("a rule that was turned off does not free a saved item early: it keeps its own timer", () => {
      expect(decide(waited(1), stateWith({ late: null })).code).toBe("waitlist_not_yet");
      expect(decide(waited(24), stateWith({ late: null })).decision).toBe("approve");
    });
  });

  describe("a saved item keeps its own timer, whatever the time of day", () => {
    const since = TEN_PM; // saved at 10 PM
    const at = (hours: number, over: Partial<Purchase> = {}) =>
      buy({ amountCents: 1000, at: hoursAfter(since, hours), waitlist: { since, waitHours: 24 }, ...over });
    const nine = stateWith({ late: late(21, "firm") });

    it("at noon after a 10 PM save it is STILL 'not time yet'", () => {
      const r = decide(at(14), nine); // 10 PM + 14h = noon next day: the late-night rule does not apply at noon
      expect(r).toMatchObject({ decision: "waitlist", code: "waitlist_not_yet", canOverride: false });
      expect(r.reason).toBe("It is not time yet. I'll remind you tomorrow.");
      expect(r.remindAt).toEqual(hoursAfter(since, 24));
    });

    it("stays 'not yet' through the whole day, however early or late the clock says", () => {
      for (const h of [1, 5, 8, 14, 18, 23, 23.99]) {
        expect(decide(at(h), nine).code).toBe("waitlist_not_yet");
      }
    });

    it("is free at exactly 24 hours, at any time of day", () => {
      expect(decide(at(24), nine)).toMatchObject({ decision: "approve", code: "ok_after_wait" });
      expect(decide(at(24 + 14), nine).decision).toBe("approve"); // noon, two days later
    });

    it("Buy now does not shorten the timer", () => {
      expect(decide(at(14, { overrideWait: true }), nine).code).toBe("waitlist_not_yet");
    });

    it("holds even when no wait rule applies right now (a plain daytime buy)", () => {
      const none = stateWith({});
      expect(decide(at(14), none).code).toBe("waitlist_not_yet");
      expect(decide(at(24), none)).toMatchObject({ decision: "approve", code: "ok" });
    });

    it("holds under a gentle rule too (Buy now does not skip it)", () => {
      const gentle = stateWith({ big: big(5000, "gentle") });
      expect(decide(at(14, { amountCents: 9000, overrideWait: true }), gentle).code).toBe("waitlist_not_yet");
    });

    it("uses its own wait time (48 hours), not the rule's current one", () => {
      const r = decide(buy({ amountCents: 1000, at: hoursAfter(since, 30), waitlist: { since, waitHours: 48 } }), nine);
      expect(r.code).toBe("waitlist_not_yet");
      expect(r.reason).toBe("It is not time yet. I'll remind you in 2 days.");
      expect(decide(buy({ amountCents: 1000, at: hoursAfter(since, 48), waitlist: { since, waitHours: 48 } }), nine).decision).toBe("approve");
    });

    it("the walls still come first (over budget is refused, not 'not yet')", () => {
      const s = stateWith({ late: late(21, "firm") }, { spentThisWeekCents: 39_500 });
      expect(decide(at(14), s).code).toBe("over_budget");
    });

    it("a lock that began later wins over the timer", () => {
      const locked = stateWith({ late: late(21, "locked"), big: big(500, "locked") });
      expect(decide(at(14), locked).code).toBe("locked_rule");
    });

    it("an essential does not wait on the timer either (it passes every user rule)", () => {
      expect(decide(at(14, { category: "groceries" }), nine)).toMatchObject({ decision: "approve", code: "ok_essential" });
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("locked: never, while the rule is on", () => {
  const locked = stateWith({ big: big(5000, "locked") });

  it("refuses, and tells the user how to change it", () => {
    const r = decide(buy(), locked);
    expect(r).toMatchObject({ decision: "refuse", code: "locked_rule", canOverride: false });
    expect(r.reason).toBe("You said never buy this kind of thing. To change that, edit your rule. It takes a day.");
  });

  it("is never a one-tap override", () => {
    const r = decide(buy({ overrideWait: true }), locked);
    expect(r).toMatchObject({ decision: "refuse", overridden: false });
    expect(r.overriddenRules).toEqual([]);
  });

  it("a locked late-night rule locks the night", () => {
    const s = stateWith({ late: late(21, "locked") });
    expect(decide(buy({ amountCents: 100, at: TEN_PM }), s).code).toBe("locked_rule");
    expect(decide(buy({ amountCents: 100, at: NOON }), s).decision).toBe("approve");
  });

  it("a locked rule changed under 24 hours ago STILL applies when it was loosened", () => {
    // It was locked. 23 hours ago the user changed it to gentle. The lock stays until the change takes effect.
    const s = stateWith({});
    s.rules.waitOverCents = { value: big(5000, "gentle"), changedAt: hoursBefore(NOON, 23), previous: big(5000, "locked") };
    expect(decide(buy(), s).code).toBe("locked_rule");
  });

  it("a locked rule that was turned off under 24 hours ago STILL applies", () => {
    const s = stateWith({});
    s.rules.waitOverCents = { value: null, changedAt: hoursBefore(NOON, 23), previous: big(5000, "locked") };
    expect(decide(buy(), s).code).toBe("locked_rule");
  });

  it("a locked rule with a changed amount keeps the OLD amount for 24 hours", () => {
    const s = stateWith({});
    s.rules.waitOverCents = { value: big(20_000, "locked"), changedAt: hoursBefore(NOON, 23), previous: big(5000, "locked") };
    expect(decide(buy({ amountCents: 9000 }), s).code).toBe("locked_rule"); // old $50 limit still locks a $90 buy
  });

  it("the lock is gone once the change has taken effect (24 hours)", () => {
    const s = stateWith({});
    s.rules.waitOverCents = { value: big(5000, "gentle"), changedAt: hoursBefore(NOON, 24), previous: big(5000, "locked") };
    expect(decide(buy(), s).code).toBe("wait_big_buy");
  });

  it("a brand-new locked rule starts to count after the one-day delay, like every rule change", () => {
    const s = stateWith({});
    s.rules.waitOverCents = { value: big(5000, "locked"), changedAt: hoursBefore(NOON, 23), previous: null };
    expect(decide(buy(), s).decision).toBe("approve");
    s.rules.waitOverCents = { value: big(5000, "locked"), changedAt: hoursBefore(NOON, 24), previous: null };
    expect(decide(buy(), s).code).toBe("locked_rule");
  });

  it("an essential DOES pass a locked rule (groceries at 11 PM are never blocked by a lock)", () => {
    const s = stateWith({ late: late(21, "locked"), essentials: ["groceries"] });
    expect(decide(buy({ category: "groceries", amountCents: 500, at: TEN_PM }), s)).toMatchObject({ decision: "approve", code: "ok_essential" });
    const bigLocked = stateWith({ big: big(5000, "locked"), essentials: ["groceries"] });
    expect(decide(buy({ category: "groceries", amountCents: 9000 }), bigLocked).code).toBe("ok_essential");
  });

  it("a non-essential is still locked out at the same moment", () => {
    const s = stateWith({ late: late(21, "locked"), essentials: ["groceries"] });
    expect(decide(buy({ category: "gadgets", amountCents: 500, at: TEN_PM }), s).code).toBe("locked_rule");
  });

  it("the locked reason is the same wherever the lock came from", () => {
    const s = stateWith({ big: big(5000, "gentle"), late: late(21, "locked") });
    expect(decide(buy({ at: TEN_PM }), s).reason).toBe("You said never buy this kind of thing. To change that, edit your rule. It takes a day.");
  });
});

// ---------------------------------------------------------------------------------------------
describe("essentials", () => {
  it("pass a gentle rule", () => {
    const s = stateWith({ big: big(5000, "gentle") });
    expect(decide(buy({ category: "groceries" }), s)).toMatchObject({ decision: "approve", code: "ok_essential" });
  });

  it("pass a firm rule", () => {
    const s = stateWith({ big: big(5000, "firm"), late: late(21, "firm") });
    expect(decide(buy({ category: "groceries", at: TEN_PM }), s)).toMatchObject({ decision: "approve", code: "ok_essential" });
  });

  it("pass a locked rule (every user rule, at any strength)", () => {
    const s = stateWith({ big: big(5000, "locked"), late: late(21, "locked") });
    expect(decide(buy({ category: "groceries", at: TEN_PM }), s)).toMatchObject({ decision: "approve", code: "ok_essential" });
  });

  it("do not pass the weekly budget", () => {
    const s = stateWith({ big: big(5000, "gentle") }, { spentThisWeekCents: 39_000 });
    expect(decide(buy({ category: "groceries", amountCents: 2000 }), s).code).toBe("over_budget");
  });

  it("do not pass the walls, even under a locked rule", () => {
    const s = stateWith({ big: big(5000, "locked") }, { spentThisWeekCents: 39_000 });
    expect(decide(buy({ category: "groceries", amountCents: 2000 }), s).code).toBe("over_budget");
    expect(decide(buy({ category: "groceries", amountCents: 100, sellerFlaggedScam: true }), s).code).toBe("scam_seller");
    expect(decide(buy({ category: "groceries", amountCents: 100, agentStartedFromUntrustedText: true }), s).code).toBe("untrusted_agent");
  });

  it("do not pass protected money", () => {
    const s = stateWith({ big: big(5000, "firm") }, { balanceCents: 121_000 });
    expect(decide(buy({ category: "groceries", amountCents: 2000 }), s).code).toBe("protected_money");
  });
});

// ---------------------------------------------------------------------------------------------
describe("hard walls: no strength, no override, no waiting gets past them", () => {
  const everyStrength: [string, RuleSet][] = [
    ["no rules", {}],
    ["gentle", { big: big(5000, "gentle"), late: late(21, "gentle") }],
    ["firm", { big: big(5000, "firm"), late: late(21, "firm") }],
    ["locked", { big: big(5000, "locked"), late: late(21, "locked") }],
  ];

  describe.each(everyStrength)("with %s rules", (_name, rules) => {
    const waitlist = { since: hoursBefore(NOON, 48), waitHours: 24 };

    it("refuses protected money, even with Buy now and a served wait", () => {
      const s = stateWith(rules, { balanceCents: 121_000 });
      const r = decide(buy({ amountCents: 1001, category: "groceries", overrideWait: true, waitlist }), s);
      expect(r).toMatchObject({ decision: "refuse", code: "protected_money", canOverride: false, overridden: false });
    });

    it("refuses going over the weekly budget, even with Buy now and a served wait", () => {
      const s = stateWith(rules, { spentThisWeekCents: 39_999 });
      const r = decide(buy({ amountCents: 2, category: "groceries", overrideWait: true, waitlist }), s);
      expect(r).toMatchObject({ decision: "refuse", code: "over_budget", canOverride: false });
    });

    it("refuses a seller flagged as a scam", () => {
      const r = decide(buy({ amountCents: 100, category: "groceries", overrideWait: true, waitlist, sellerFlaggedScam: true }), stateWith(rules));
      expect(r).toMatchObject({ decision: "refuse", code: "scam_seller", canOverride: false });
      expect(r.reason).toBe("This seller looks like a scam. I won't pay them.");
    });

    it("refuses a buy an AI agent started from untrusted listing text", () => {
      const r = decide(buy({ amountCents: 100, category: "groceries", overrideWait: true, waitlist, agentStartedFromUntrustedText: true }), stateWith(rules));
      expect(r).toMatchObject({ decision: "refuse", code: "untrusted_agent", canOverride: false });
      expect(r.reason).toBe("This buy was started by text in a listing, not by you. I won't pay for it.");
    });
  });

  it("a wall's reason wins over a locked rule's reason", () => {
    const s = stateWith({ big: big(5000, "locked") }, { spentThisWeekCents: 39_999 });
    expect(decide(buy({ amountCents: 9000 }), s).code).toBe("over_budget");
  });

  it("a firm wait is not saved for a buy that is refused anyway", () => {
    const s = stateWith({ late: late(21, "firm") }, { spentThisWeekCents: 39_999 });
    expect(decide(buy({ amountCents: 100, at: TEN_PM }), s).decision).toBe("refuse");
  });
});

// ---------------------------------------------------------------------------------------------
describe("AI can only add caution", () => {
  const states = [stateWith({}), stateWith({ big: big(5000, "gentle") }), stateWith({ late: late(21, "firm") })];

  it("a caution flag can only turn an answer into a refuse, never into an approve", () => {
    for (const s of states) {
      for (const at of [NOON, TEN_PM]) {
        for (const amountCents of [100, 9000]) {
          const base = decide(buy({ amountCents, at }), s);
          for (const flag of ["sellerFlaggedScam", "agentStartedFromUntrustedText"] as const) {
            const flagged = decide(buy({ amountCents, at, [flag]: true }), s);
            expect(flagged.decision).toBe("refuse");
            const off = decide(buy({ amountCents, at, [flag]: false }), s);
            expect(off).toEqual(base); // false is the same as not set: a flag can't loosen anything
          }
        }
      }
    }
  });
});
