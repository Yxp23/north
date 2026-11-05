import { describe, expect, it } from "vitest";
import { evaluateProposal } from "./evaluate";
import type { Changeable, Rules } from "../guardian";
import type { Proposed } from "./types";

const NOW = new Date("2026-11-05T15:00:00Z");
const settled = <T,>(value: T | null): Changeable<T> => ({ value, changedAt: new Date("2026-10-01T00:00:00Z"), previous: null });

function rulesWith(big: Rules["waitOverCents"]["value"], late: Rules["waitAfterHour"]["value"]): Rules {
  return { waitOverCents: settled(big), waitAfterHour: settled(late), essentials: settled(["groceries"]) };
}
// The demo user: over $50 (gentle), after 9pm (firm, a day)
const demo = rulesWith({ cents: 5000, strength: "gentle" }, { afterHour: 21, untilHour: 5, strength: "firm", waitHours: 24 });
const CTX = { weeklyBudgetCents: 40_000 };

const big = (cents: number): Proposed => ({ kind: "big_buy", cents });
const night = (afterHour: number, untilHour = 5): Proposed => ({ kind: "late_night", afterHour, untilHour });

describe("evaluating what the Concierge understood", () => {
  it("a rule where there is none is new, with any strength allowed", () => {
    const [i] = evaluateProposal([big(3000)], rulesWith(null, null), NOW, CTX);
    expect(i).toMatchObject({ status: "new", minStrength: null });
  });

  it("a lower amount is tighter, and the strength can't go below what you have", () => {
    const [i] = evaluateProposal([big(3000)], demo, NOW, CTX);
    expect(i).toMatchObject({ status: "tighter", minStrength: "gentle" });
  });

  it("a rule you already have (same numbers) is 'same', and keeps your strength as the minimum", () => {
    const [i] = evaluateProposal([night(21)], demo, NOW, CTX);
    expect(i).toMatchObject({ status: "same", minStrength: "firm" });
  });

  it("a higher amount is blocked, and says why in plain words with both numbers", () => {
    const [i] = evaluateProposal([big(10_000)], demo, NOW, CTX);
    expect(i.status).toBe("looser");
    expect(i.blockedText).toBe("You already have a rule for buys over $50. Over $100 is weaker, and I can only make rules stricter.");
  });

  it("a smaller night window is blocked", () => {
    const [i] = evaluateProposal([night(23)], demo, NOW, CTX);
    expect(i.status).toBe("looser");
    expect(i.blockedText).toBe("You already have a rule for buys from 9pm to 5am. That time is shorter, and I can only make rules stricter.");
  });

  it("a bigger night window is tighter", () => {
    expect(evaluateProposal([night(20)], demo, NOW, CTX)[0].status).toBe("tighter");
  });

  it("compares with the newest setting too, so a pending loosening can't be used as a ladder", () => {
    // In force: over $50 locked. Pending (asked for 1 hour ago): over $50 gentle. Asking for gentle again is still weaker than what is in force.
    const pending: Rules = {
      ...demo,
      waitOverCents: { value: { cents: 5000, strength: "gentle" }, changedAt: new Date(NOW.getTime() - 3600_000), previous: { cents: 5000, strength: "locked" } },
    };
    const [i] = evaluateProposal([big(5000)], pending, NOW, CTX);
    expect(i.minStrength).toBe("locked");
  });

  it("warns when the amount is more than the whole week", () => {
    const [i] = evaluateProposal([big(50_000)], rulesWith(null, null), NOW, CTX);
    expect(i.note).toBe("Your plan for the week is only $400, so a rule for buys over $500 would never stop anything.");
  });

  it("does not warn when it is within the week", () => {
    expect(evaluateProposal([big(30_000)], rulesWith(null, null), NOW, CTX)[0].note).toBeUndefined();
  });

  it("evaluates each rule on its own", () => {
    const items = evaluateProposal([big(3000), night(23)], demo, NOW, CTX);
    expect(items.map((i) => i.status)).toEqual(["tighter", "looser"]);
  });
});
