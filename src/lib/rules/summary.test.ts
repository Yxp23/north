import { describe, expect, it } from "vitest";
import { summarizeRules, rulesInWords } from "./summary";
import type { BigBuyRule, Changeable, LateNightRule, Rules } from "../guardian";

const NOW = new Date("2026-11-05T15:00:00Z");
const HOUR = 3_600_000;
const settled = <T,>(value: T | null): Changeable<T> => ({ value, changedAt: new Date("2026-10-01T00:00:00Z"), previous: null });
const demo: Rules = {
  waitOverCents: settled({ cents: 5000, strength: "gentle" }),
  waitAfterHour: settled({ afterHour: 21, untilHour: 5, strength: "firm", waitHours: 24 }),
  essentials: settled(["groceries"]),
};

describe("my rules, in plain words", () => {
  it("lists the rules that are on, with their strength", () => {
    expect(summarizeRules(demo, NOW)).toEqual([
      { kind: "big_buy", strength: "gentle", text: "Wait on buys over $50. You can still tap Buy now.", rule: { cents: 5000, strength: "gentle" } },
      { kind: "late_night", strength: "firm", text: "Wait a day on buys from 9pm to 5am. I save it and remind you.", rule: { afterHour: 21, untilHour: 5, strength: "firm", waitHours: 24 } },
    ]);
  });

  it("leaves out a rule that is not on", () => {
    expect(summarizeRules({ ...demo, waitOverCents: settled<BigBuyRule>(null) }, NOW)).toHaveLength(1);
  });

  it("shows a change that is waiting, and says when it starts, while the old rule stays", () => {
    const asked = new Date(NOW.getTime() - 2 * HOUR);
    const r: Rules = { ...demo, waitOverCents: { value: { cents: 3000, strength: "locked" }, changedAt: asked, previous: { cents: 5000, strength: "gentle" } } };
    const [line] = summarizeRules(r, NOW);
    expect(line.text).toBe("Wait on buys over $50. You can still tap Buy now.");
    expect(line.pending).toEqual({ text: "Never buy things over $30.", startsAt: new Date(asked.getTime() + 24 * HOUR).toISOString() });
  });

  it("shows a brand-new rule as 'not on yet'", () => {
    const asked = new Date(NOW.getTime() - HOUR);
    const r: Rules = { ...demo, waitOverCents: { value: { cents: 3000, strength: "firm" }, changedAt: asked, previous: null } };
    const [line] = summarizeRules(r, NOW);
    expect(line).toMatchObject({ kind: "big_buy", strength: null, text: "Not on yet." });
    expect(line.pending?.text).toBe("Wait a day on buys over $30. I save it and remind you.");
  });

  it("a change that has started is simply the rule", () => {
    const r: Rules = { ...demo, waitOverCents: { value: { cents: 3000, strength: "locked" }, changedAt: new Date(NOW.getTime() - 25 * HOUR), previous: { cents: 5000, strength: "gentle" } } };
    expect(summarizeRules(r, NOW)[0]).toEqual({ kind: "big_buy", strength: "locked", text: "Never buy things over $30.", rule: { cents: 3000, strength: "locked" } });
  });

  it("the words for the AI helper list them, or say there are none", () => {
    expect(rulesInWords(demo, NOW)).toBe("Your rules now:\n- Wait on buys over $50. You can still tap Buy now.\n- Wait a day on buys from 9pm to 5am. I save it and remind you.");
    expect(rulesInWords({ ...demo, waitOverCents: settled<BigBuyRule>(null), waitAfterHour: settled<LateNightRule>(null) }, NOW)).toBe("You have no wait rules yet.");
  });
});
