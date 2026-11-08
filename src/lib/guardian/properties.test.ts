import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { decide, effective, isEssential, RULE_DELAY_MS, type BigBuyRule, type Changeable, type Decision, type LateNightRule, type Purchase, type Rules, type Strength, type UserState } from "./index";

// PROPERTY-BASED TESTS for the Money Guardian. Instead of a few hand-picked cases, fast-check invents thousands of random
// purchases, rules, money situations and times, and checks that the promises always hold. If one ever breaks, fast-check prints
// the smallest example and a seed to replay it.
vi.setConfig({ testTimeout: 120_000 }); // thousands of random cases per promise
const RUNS = 3000;
const assertProp = <T extends unknown[]>(prop: fc.IPropertyWithHooks<T>, runs = RUNS) => fc.assert(prop, { numRuns: runs, verbose: 1 });

const HOUR = 3_600_000;
const rank: Record<Decision, number> = { approve: 0, wait: 1, waitlist: 2, refuse: 3 };

// ---- generators --------------------------------------------------------------------------------
const strength = fc.constantFrom<Strength>("gentle", "firm", "locked");
const waitHours = fc.option(fc.integer({ min: 1, max: 200 }), { nil: undefined });
const bigRule: fc.Arbitrary<BigBuyRule> = fc.record({ cents: fc.integer({ min: 0, max: 300_000 }), strength, waitHours });
const lateRule: fc.Arbitrary<LateNightRule> = fc.record({ afterHour: fc.integer({ min: 0, max: 23 }), untilHour: fc.integer({ min: 0, max: 23 }), strength, waitHours });
const CATEGORIES = ["groceries", "medicine", "household", "personal care", "shoes", "electronics", "clothes", "school and office", "Groceries ", " MEDICINE", ""];
const category = fc.constantFrom(...CATEGORIES);
const essentialsList = fc.subarray(["groceries", "medicine", "household", "personal care", "Medicine ", "FOOD"]);
const zone = fc.constantFrom("UTC", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland", "Europe/London");
const instant = fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2027-12-31T00:00:00Z"), noInvalidDate: true });
const ageMs = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 24 * HOUR - 1 }) }, // a change still waiting out its day
  { weight: 1, arbitrary: fc.integer({ min: 24 * HOUR, max: 90 * 24 * HOUR }) }, // long settled
);

/** A rule whose newest change is `age` old. */
const changeable = <T>(value: T | null, previous: T | null, at: Date, age: number): Changeable<T> => ({ value, previous, changedAt: new Date(at.getTime() - age) });
const maybe = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: null });

const stateFor = (at: Date) =>
  fc.record({
    balanceCents: fc.integer({ min: 0, max: 3_000_000 }),
    protectedCents: fc.integer({ min: 0, max: 3_000_000 }),
    weeklyBudgetCents: fc.integer({ min: 0, max: 1_000_000 }),
    spentThisWeekCents: fc.integer({ min: 0, max: 1_200_000 }),
    timeZone: zone,
    big: fc.tuple(maybe(bigRule), maybe(bigRule), ageMs),
    late: fc.tuple(maybe(lateRule), maybe(lateRule), ageMs),
    ess: fc.tuple(maybe(essentialsList), maybe(essentialsList), ageMs),
  }).map(({ big, late, ess, ...money }): UserState => ({
    ...money,
    rules: { waitOverCents: changeable(big[0], big[1], at, big[2]), waitAfterHour: changeable(late[0], late[1], at, late[2]), essentials: changeable(ess[0], ess[1], at, ess[2]) },
  }));

const purchaseFor = (at: Date): fc.Arbitrary<Purchase> =>
  fc.record({
    amountCents: fc.integer({ min: 1, max: 2_000_000 }),
    item: fc.string({ maxLength: 40 }),
    category,
    at: fc.constant(at),
    overrideWait: fc.option(fc.boolean(), { nil: undefined }),
    sellerFlaggedScam: fc.option(fc.boolean(), { nil: undefined }),
    agentStartedFromUntrustedText: fc.option(fc.boolean(), { nil: undefined }),
    hourOverride: fc.option(fc.integer({ min: 0, max: 23 }), { nil: undefined }),
    waitlist: fc.option(fc.record({ since: fc.integer({ min: 0, max: 14 * 24 }).map((h) => new Date(at.getTime() - h * HOUR)), waitHours: fc.integer({ min: 1, max: 100 }) }), { nil: undefined }),
  });

/** A world: a moment, the person's money and rules at that moment, and a purchase. */
const world = instant.chain((at) => fc.record({ at: fc.constant(at), state: stateFor(at), purchase: purchaseFor(at) }));

const spendable = (s: UserState) => s.balanceCents - s.protectedCents;
const effEssential = (p: Purchase, s: UserState) => isEssential(p, effective(s.rules.essentials, p.at));

// ---- the promises ------------------------------------------------------------------------------
describe("the walls hold for every purchase, rule and time", () => {
  it("never approves more than what is left in the week", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      if (decide(purchase, state).decision === "approve") expect(state.spentThisWeekCents + purchase.amountCents).toBeLessThanOrEqual(state.weeklyBudgetCents);
    }));
  });

  it("never approves anything that touches the protected rent-and-bills money", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      if (decide(purchase, state).decision === "approve") expect(purchase.amountCents).toBeLessThanOrEqual(spendable(state));
    }));
  });

  it("a scam seller always gets a refuse", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const r = decide({ ...purchase, sellerFlaggedScam: true }, state);
      expect(r.decision).toBe("refuse");
      expect(r.canOverride).toBe(false);
    }));
  });

  it("a buy an AI agent started from untrusted text always gets a refuse, even with Buy now and even for an essential", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      for (const overrideWait of [true, false, undefined]) {
        const r = decide({ ...purchase, agentStartedFromUntrustedText: true, overrideWait }, state);
        expect(r.decision).toBe("refuse");
        expect(r.canOverride).toBe(false);
      }
    }));
  });

  it("an essential never gets past a wall", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const wall = purchase.sellerFlaggedScam === true || purchase.agentStartedFromUntrustedText === true || purchase.amountCents > spendable(state) || state.spentThisWeekCents + purchase.amountCents > state.weeklyBudgetCents;
      if (effEssential(purchase, state) && wall) expect(decide(purchase, state).decision).toBe("refuse");
    }));
  });

  it("adding a caution flag can only make the answer stricter, never looser", () => {
    assertProp(fc.property(world, fc.constantFrom("sellerFlaggedScam", "agentStartedFromUntrustedText"), ({ state, purchase }, flag) => {
      const base = decide({ ...purchase, sellerFlaggedScam: false, agentStartedFromUntrustedText: false }, state);
      const flagged = decide({ ...purchase, sellerFlaggedScam: false, agentStartedFromUntrustedText: false, [flag]: true }, state);
      expect(rank[flagged.decision]).toBeGreaterThanOrEqual(rank[base.decision]);
    }));
  });
});

describe("only the person can override a wait", () => {
  it("'Buy now' can only turn a gentle wait into an approval: every other answer stays exactly the same", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const without = decide({ ...purchase, overrideWait: false }, state);
      const withIt = decide({ ...purchase, overrideWait: true }, state);
      if (without.decision === "wait") {
        expect(withIt.decision).toBe("approve");
        expect(withIt.code).toBe("ok_override");
      } else {
        expect(withIt).toEqual(without);
      }
    }));
  });

  it("without Buy now, nothing is ever approved by an override", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      for (const overrideWait of [false, undefined]) {
        const r = decide({ ...purchase, overrideWait }, state);
        expect(r.overridden).toBe(false);
        expect(r.code).not.toBe("ok_override");
      }
    }));
  });

  it("an answer that is a wait list or a refuse can never be overridden", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const r = decide({ ...purchase, overrideWait: false }, state);
      if (r.decision === "waitlist" || r.decision === "refuse") expect(r.canOverride).toBe(false);
      if (r.canOverride) expect(r.decision).toBe("wait");
    }));
  });

  it("a locked rule is never approved, for anyone, unless the item is on the must-have list", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const r = decide({ ...purchase, overrideWait: true }, state);
      if (r.code === "ok_override") expect(r.triggered.every((id) => id === "big_buy" || id === "late_night")).toBe(true);
      // A locked rule that applies makes the answer a refuse (locked_rule) when the walls are clear and the item is not essential.
      if (r.decision === "approve" && !effEssential(purchase, state)) {
        const big = effective(state.rules.waitOverCents, purchase.at);
        const hit = big && purchase.amountCents > big.cents;
        if (hit) expect(big.strength).not.toBe("locked");
      }
    }));
  });
});

describe("a rule loosened less than a day ago still applies", () => {
  // The oracle: what the Guardian says when the PREVIOUS setting has been in place for ever.
  const settledWith = (state: UserState, at: Date): UserState => ({
    ...state,
    rules: {
      waitOverCents: { value: state.rules.waitOverCents.previous, previous: null, changedAt: new Date(at.getTime() - 90 * 24 * HOUR) },
      waitAfterHour: { value: state.rules.waitAfterHour.previous, previous: null, changedAt: new Date(at.getTime() - 90 * 24 * HOUR) },
      essentials: { value: state.rules.essentials.previous, previous: null, changedAt: new Date(at.getTime() - 90 * 24 * HOUR) },
    },
  });
  const youngRules = (at: Date): fc.Arbitrary<Rules> =>
    fc.tuple(maybe(bigRule), maybe(bigRule), maybe(lateRule), maybe(lateRule), maybe(essentialsList), maybe(essentialsList), fc.integer({ min: 0, max: 24 * HOUR - 1 })).map(([b0, b1, l0, l1, e0, e1, age]) => ({
      waitOverCents: changeable(b0, b1, at, age), waitAfterHour: changeable(l0, l1, at, age), essentials: changeable(e0, e1, at, age),
    }));

  it("while the change is under 24 hours old, the answer is exactly the answer with the OLD rules", () => {
    assertProp(fc.property(instant.chain((at) => fc.record({ at: fc.constant(at), rules: youngRules(at), state: stateFor(at), purchase: purchaseFor(at) })), ({ at, rules, state, purchase }) => {
      const young: UserState = { ...state, rules };
      expect(decide(purchase, young)).toEqual(decide(purchase, settledWith(young, at)));
    }));
  });

  it("the demo clock (an hour override) never makes a young change count early", () => {
    assertProp(fc.property(instant.chain((at) => fc.record({ at: fc.constant(at), rules: youngRules(at), state: stateFor(at), purchase: purchaseFor(at), hour: fc.integer({ min: 0, max: 23 }) })), ({ at, rules, state, purchase, hour }) => {
      const young: UserState = { ...state, rules };
      const pretend = { ...purchase, hourOverride: hour };
      // With the SAME pretend hour on both sides, the young rules still behave like the old ones.
      expect(decide(pretend, young)).toEqual(decide(pretend, settledWith(young, at)));
    }));
  });

  it("turning a rule off, raising its amount or weakening its strength can never make the answer stricter-looking early: it is never LOOSER than the settled new rule", () => {
    const loosenBig = (b: BigBuyRule): fc.Arbitrary<BigBuyRule | null> =>
      fc.oneof(fc.constant(null), fc.record({ cents: fc.integer({ min: b.cents, max: b.cents + 100_000 }), strength: fc.constantFrom<Strength>(...(b.strength === "locked" ? ["locked", "firm", "gentle"] : b.strength === "firm" ? ["firm", "gentle"] : ["gentle"]) as Strength[]), waitHours: fc.constant(b.waitHours) }));
    assertProp(fc.property(instant.chain((at) => bigRule.chain((prev) => fc.record({ at: fc.constant(at), prev: fc.constant(prev), next: loosenBig(prev), age: fc.integer({ min: 0, max: 24 * HOUR - 1 }), state: stateFor(at), purchase: purchaseFor(at) }))), ({ at, prev, next, age, state, purchase }) => {
      const pending: UserState = { ...state, rules: { ...state.rules, waitOverCents: changeable(next, prev, at, age) } };
      const settledNew: UserState = { ...state, rules: { ...state.rules, waitOverCents: changeable(next, prev, at, 90 * 24 * HOUR) } };
      expect(rank[decide(purchase, pending).decision]).toBeGreaterThanOrEqual(rank[decide(purchase, settledNew).decision]);
    }));
  });

  it("exactly 24 hours counts as done, 24 hours minus a millisecond does not", () => {
    const at = new Date("2026-11-05T15:00:00Z");
    const prev: BigBuyRule = { cents: 0, strength: "locked" };
    const s = (age: number): UserState => ({
      balanceCents: 1_000_000, protectedCents: 0, weeklyBudgetCents: 1_000_000, spentThisWeekCents: 0, timeZone: "UTC",
      rules: { waitOverCents: changeable<BigBuyRule>(null, prev, at, age), waitAfterHour: changeable<LateNightRule>(null, null, at, 0), essentials: changeable<string[]>(null, null, at, 0) },
    });
    const p: Purchase = { amountCents: 100, item: "x", category: "shoes", at };
    expect(decide(p, s(RULE_DELAY_MS - 1)).code).toBe("locked_rule");
    expect(decide(p, s(RULE_DELAY_MS)).code).toBe("ok");
  });
});

describe("a saved item keeps its own timer", () => {
  it("a non-essential saved item is never approved before its wait is over, whatever the hour or the rules", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const w = purchase.waitlist;
      if (!w) return;
      const notYet = purchase.at.getTime() < w.since.getTime() + w.waitHours * HOUR;
      if (notYet && !effEssential(purchase, state)) expect(decide({ ...purchase, overrideWait: true }, state).decision).not.toBe("approve");
    }));
  });
});

describe("fail closed", () => {
  const nonsense = fc.oneof(fc.constant(Number.NaN), fc.constant(Infinity), fc.constant(-Infinity), fc.constant(0), fc.constant(-1), fc.double({ min: 0.001, max: 99.9, noNaN: true }).filter((n) => !Number.isInteger(n)), fc.constant(2 ** 53), fc.constant(Number.MAX_VALUE), fc.integer({ max: 0 }));

  it("an amount that is not a positive whole number of cents is refused, whatever else is true", () => {
    assertProp(fc.property(world, nonsense, ({ state, purchase }, amount) => {
      const r = decide({ ...purchase, amountCents: amount, overrideWait: true }, state);
      expect(r.decision).toBe("refuse");
    }));
  });

  it("a time that can't be read is refused", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      expect(decide({ ...purchase, at: new Date(Number.NaN) }, state).decision).toBe("refuse");
    }));
  });

  it("a time zone that can't be read is refused", () => {
    assertProp(fc.property(world, fc.constantFrom("", "Not/AZone", "UTC+99", "💥"), ({ state, purchase }, tz) => {
      expect(decide(purchase, { ...state, timeZone: tz }).decision).toBe("refuse");
    }), 300);
  });

  it("a pretend hour that is not 0 to 23 is refused", () => {
    assertProp(fc.property(world, fc.oneof(fc.integer({ min: 24, max: 1000 }), fc.integer({ min: -1000, max: -1 }), fc.constant(1.5), fc.constant(Number.NaN)), ({ state, purchase }, h) => {
      expect(decide({ ...purchase, hourOverride: h }, state).decision).toBe("refuse");
    }));
  });
});

describe("the Guardian is plain code", () => {
  it("gives the same answer for the same question, and does not change what it was given", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const before = JSON.stringify({ state, purchase });
      const a = decide(purchase, state);
      const b = decide(purchase, state);
      expect(a).toEqual(b);
      expect(JSON.stringify({ state, purchase })).toBe(before);
    }));
  });

  it("always answers with a known decision and a reason in words", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const r = decide(purchase, state);
      expect(Object.keys(rank)).toContain(r.decision);
      expect(r.reason.length).toBeGreaterThan(5);
      expect(r.reason).not.toMatch(/\$|undefined|NaN|\[object/);
    }));
  });

  it("a firm wait always comes with a time to try again, and never with Buy now", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const r = decide({ ...purchase, overrideWait: true }, state);
      if (r.decision === "waitlist") {
        expect(r.canOverride).toBe(false);
        expect(r.remindAt).toBeInstanceOf(Date);
        expect(r.waitHours).toBeGreaterThan(0);
      }
    }));
  });
});

describe("fail closed on the person's own settings", () => {
  const junk = fc.oneof(fc.constant(Number.NaN), fc.constant(Infinity), fc.constant(-1), fc.constant(1.5), fc.constant(2 ** 60), fc.constant("100" as unknown as number), fc.constant(null as unknown as number), fc.constant(undefined as unknown as number));

  it.each(["protectedCents", "weeklyBudgetCents", "spentThisWeekCents", "balanceCents"] as const)("a %s that is not a whole number of cents is refused (never read as 'no limit')", (field) => {
    assertProp(fc.property(world, junk, ({ state, purchase }, bad) => {
      const r = decide({ ...purchase, overrideWait: true }, { ...state, [field]: bad });
      expect(r.decision).toBe("refuse");
    }), 500);
  });

  it("a wait rule with a nonsense amount is refused, not skipped", () => {
    assertProp(fc.property(world, junk, strength, ({ state, purchase }, bad, st) => {
      const rules = { ...state.rules, waitOverCents: { value: { cents: bad, strength: st } as BigBuyRule, previous: { cents: bad, strength: st } as BigBuyRule, changedAt: new Date(purchase.at.getTime() - 40 * 24 * HOUR) } };
      expect(decide(purchase, { ...state, rules }).decision).toBe("refuse");
    }), 500);
  });

  it("a night rule with an hour that doesn't exist, or a rule with an unknown strength, is refused", () => {
    assertProp(fc.property(world, fc.oneof(fc.integer({ min: 24, max: 99 }), fc.integer({ min: -9, max: -1 }), fc.constant(1.5), fc.constant(Number.NaN)), ({ state, purchase }, hour) => {
      const long = new Date(purchase.at.getTime() - 40 * 24 * HOUR);
      const rules = { ...state.rules, waitAfterHour: { value: { afterHour: hour, untilHour: 5, strength: "gentle" } as LateNightRule, previous: null, changedAt: long } };
      expect(decide(purchase, { ...state, rules }).decision).toBe("refuse");
    }), 500);
    assertProp(fc.property(world, fc.constantFrom("none", "off", "GENTLE", "", "soft"), ({ state, purchase }, st) => {
      const long = new Date(purchase.at.getTime() - 40 * 24 * HOUR);
      const rules = { ...state.rules, waitOverCents: { value: { cents: 10, strength: st } as unknown as BigBuyRule, previous: null, changedAt: long } };
      expect(decide(purchase, { ...state, rules }).decision).toBe("refuse");
    }), 500);
  });

  it("a rule with a date that can't be read is refused", () => {
    assertProp(fc.property(world, ({ state, purchase }) => {
      const rules = { ...state.rules, essentials: { value: ["groceries"], previous: null, changedAt: new Date(Number.NaN) } };
      expect(decide(purchase, { ...state, rules }).decision).toBe("refuse");
    }), 300);
  });
});
