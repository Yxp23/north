import { describe, expect, it } from "vitest";
import { bigBuyTiming, compareBigBuy, compareLateNight, lateNightTiming, removeTiming } from "./compare";
import type { BigBuyRule, LateNightRule } from "../guardian";

const big = (cents: number, strength: BigBuyRule["strength"] = "gentle", waitHours?: number): BigBuyRule => ({ cents, strength, ...(waitHours ? { waitHours } : {}) });
const late = (afterHour: number, untilHour: number, strength: LateNightRule["strength"] = "gentle", waitHours?: number): LateNightRule => ({ afterHour, untilHour, strength, ...(waitHours ? { waitHours } : {}) });

describe("big-buy rules: only create or tighten", () => {
  it("a rule where there was none is new", () => {
    expect(compareBigBuy(null, big(5000))).toMatchObject({ verdict: "new" });
  });

  it("a lower amount is tighter", () => {
    expect(compareBigBuy(big(5000), big(3000)).verdict).toBe("tighter");
  });

  it("a higher amount is looser", () => {
    expect(compareBigBuy(big(5000), big(7500)).verdict).toBe("looser");
  });

  it("the same rule is the same", () => {
    expect(compareBigBuy(big(5000), big(5000)).verdict).toBe("same");
  });

  it("a stronger strength is tighter, in order gentle < firm < locked", () => {
    expect(compareBigBuy(big(5000, "gentle"), big(5000, "firm")).verdict).toBe("tighter");
    expect(compareBigBuy(big(5000, "firm"), big(5000, "locked")).verdict).toBe("tighter");
    expect(compareBigBuy(big(5000, "gentle"), big(5000, "locked")).verdict).toBe("tighter");
  });

  it("a weaker strength is looser", () => {
    expect(compareBigBuy(big(5000, "locked"), big(5000, "firm")).verdict).toBe("looser");
    expect(compareBigBuy(big(5000, "firm"), big(5000, "gentle")).verdict).toBe("looser");
  });

  it("a longer firm wait is tighter, a shorter one is looser (24 hours is the default)", () => {
    expect(compareBigBuy(big(5000, "firm", 24), big(5000, "firm", 48)).verdict).toBe("tighter");
    expect(compareBigBuy(big(5000, "firm", 48), big(5000, "firm", 24)).verdict).toBe("looser");
    expect(compareBigBuy(big(5000, "firm"), big(5000, "firm", 24)).verdict).toBe("same");
    expect(compareBigBuy(big(5000, "firm", 48), big(5000, "firm")).verdict).toBe("looser");
  });

  it("wait time does not matter for gentle or locked rules", () => {
    expect(compareBigBuy(big(5000, "gentle"), big(5000, "gentle", 99)).verdict).toBe("same");
    expect(compareBigBuy(big(5000, "locked"), big(5000, "locked", 10)).verdict).toBe("same");
  });

  it("tighter in one way and looser in another is looser (mixed)", () => {
    const r = compareBigBuy(big(5000, "gentle"), big(9000, "locked"));
    expect(r.verdict).toBe("looser");
    expect(r.mixed).toBe(true);
    expect(compareBigBuy(big(5000, "locked"), big(3000, "gentle")).verdict).toBe("looser");
  });

  it("says which part got weaker", () => {
    expect(compareBigBuy(big(5000), big(9000)).weaker).toEqual(["amount"]);
    expect(compareBigBuy(big(5000, "firm"), big(5000, "gentle")).weaker).toEqual(["strength"]);
    expect(compareBigBuy(big(5000, "firm", 48), big(5000, "firm", 24)).weaker).toEqual(["wait"]);
  });
});

describe("late-night rules: only create or tighten", () => {
  it("a rule where there was none is new", () => {
    expect(compareLateNight(null, late(21, 5)).verdict).toBe("new");
  });

  it("starting earlier is tighter (a bigger window)", () => {
    expect(compareLateNight(late(22, 5), late(21, 5)).verdict).toBe("tighter");
  });

  it("ending later is tighter", () => {
    expect(compareLateNight(late(22, 5), late(22, 7)).verdict).toBe("tighter");
  });

  it("starting later is looser (a smaller window)", () => {
    expect(compareLateNight(late(21, 5), late(23, 5)).verdict).toBe("looser");
  });

  it("a window that no longer covers some hours is looser, even if it covers new ones", () => {
    const r = compareLateNight(late(21, 5), late(1, 9)); // drops 9pm-1am, adds 5am-9am
    expect(r.verdict).toBe("looser");
  });

  it("the same window is the same", () => {
    expect(compareLateNight(late(21, 5), late(21, 5)).verdict).toBe("same");
  });

  it("works across midnight and inside one day", () => {
    expect(compareLateNight(late(1, 5), late(0, 6)).verdict).toBe("tighter"); // inside one day
    expect(compareLateNight(late(23, 2), late(22, 3)).verdict).toBe("tighter"); // across midnight
    expect(compareLateNight(late(22, 5), late(1, 5)).verdict).toBe("looser");
  });

  it("strength and wait time count the same as for big buys", () => {
    expect(compareLateNight(late(21, 5, "gentle"), late(21, 5, "firm")).verdict).toBe("tighter");
    expect(compareLateNight(late(21, 5, "firm", 24), late(21, 5, "firm", 12)).verdict).toBe("looser");
    expect(compareLateNight(late(21, 5, "firm"), late(21, 5, "gentle")).weaker).toEqual(["strength"]);
  });

  it("names the hours that got weaker", () => {
    expect(compareLateNight(late(21, 5), late(23, 5)).weaker).toEqual(["hours"]);
  });
});

describe("when a change starts: tighter is now, weaker or off is in a day", () => {
  const big = (cents: number, strength: "gentle" | "firm" | "locked" = "gentle", waitHours?: number): BigBuyRule => ({ cents, strength, ...(waitHours ? { waitHours } : {}) });
  const night = (afterHour: number, untilHour: number, strength: "gentle" | "firm" | "locked" = "firm"): LateNightRule => ({ afterHour, untilHour, strength });

  it.each([
    ["a lower amount", big(5000), big(3000), "now"],
    ["a stronger strength", big(5000), big(5000, "firm"), "now"],
    ["a longer firm wait", big(5000, "firm", 24), big(5000, "firm", 48), "now"],
    ["a rule that is not there yet", null, big(5000), "now"],
    ["exactly the same rule", big(5000), big(5000), "now"],
    ["a higher amount", big(5000), big(9000), "in_a_day"],
    ["a weaker strength", big(5000, "firm"), big(5000), "in_a_day"],
    ["a shorter firm wait", big(5000, "firm", 48), big(5000, "firm", 24), "in_a_day"],
    ["a lower amount but a weaker strength (mixed counts as weaker)", big(5000, "locked"), big(3000), "in_a_day"],
  ] as const)("big buys: %s", (_n, cur, next, want) => {
    expect(bigBuyTiming(cur, next)).toBe(want);
  });

  it.each([
    ["a longer night", night(21, 5), night(20, 6), "now"],
    ["a shorter night", night(21, 5), night(23, 5), "in_a_day"],
    ["a weaker strength", night(21, 5, "locked"), night(21, 5, "gentle"), "in_a_day"],
    ["a new rule", null, night(21, 5), "now"],
  ] as const)("late night: %s", (_n, cur, next, want) => {
    expect(lateNightTiming(cur, next)).toBe(want);
  });

  it("turning a rule off waits a day, but there is nothing to wait for when it is not on", () => {
    expect(removeTiming(big(5000))).toBe("in_a_day");
    expect(removeTiming(null)).toBe("now");
  });
});
