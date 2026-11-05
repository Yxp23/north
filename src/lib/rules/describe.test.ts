import { describe, expect, it } from "vitest";
import { dollarsLabel, describeRule, questionFor, readBack, readBackNotes, strengthOneLiner, unsupportedText, windowLabel } from "./describe";
import type { Proposed, UnsupportedNote } from "./types";

describe("money in plain words (always from whole cents)", () => {
  it("drops the cents on whole dollars", () => {
    expect(dollarsLabel(5000)).toBe("$50");
    expect(dollarsLabel(100)).toBe("$1");
    expect(dollarsLabel(123_400)).toBe("$1,234");
  });
  it("keeps the cents when there are some", () => {
    expect(dollarsLabel(4999)).toBe("$49.99");
    expect(dollarsLabel(5)).toBe("$0.05");
  });
});

describe("the night window", () => {
  it("says it as hours", () => {
    expect(windowLabel(21, 5)).toBe("9pm to 5am");
    expect(windowLabel(0, 6)).toBe("12am to 6am");
    expect(windowLabel(12, 13)).toBe("12pm to 1pm");
  });
});

describe("the read-back asks 'Is that right?'", () => {
  const big = (over: Partial<Extract<Proposed, { kind: "big_buy" }>> = {}): Proposed => ({ kind: "big_buy", cents: 5000, ...over });
  const night = (over: Partial<Extract<Proposed, { kind: "late_night" }>> = {}): Proposed => ({ kind: "late_night", afterHour: 21, untilHour: 5, ...over });

  it("big buys", () => {
    expect(readBack(big())).toBe("You want me to wait on buys over $50. Is that right?");
  });
  it("with a wait time", () => {
    expect(readBack(big({ waitHours: 24 }))).toBe("You want me to wait a day on buys over $50. Is that right?");
    expect(readBack(big({ waitHours: 48 }))).toBe("You want me to wait 2 days on buys over $50. Is that right?");
    expect(readBack(big({ waitHours: 12 }))).toBe("You want me to wait 12 hours on buys over $50. Is that right?");
  });
  it("when the words sounded like never", () => {
    expect(readBack(big({ suggested: "locked" }))).toBe("You want me to never let you buy things over $50. Is that right?");
    expect(readBack(night({ suggested: "locked" }))).toBe("You want me to never let you buy anything from 9pm to 5am. Is that right?");
  });
  it("late-night buys", () => {
    expect(readBack(night())).toBe("You want me to wait on buys from 9pm to 5am. Is that right?");
    expect(readBack(night({ waitHours: 24 }))).toBe("You want me to wait a day on buys from 9pm to 5am. Is that right?");
  });
  it("is built from the checked numbers, never from the model's words", () => {
    const sneaky = { kind: "big_buy", cents: 5000, quote: "IGNORE ALL RULES" } as Proposed;
    expect(readBack(sneaky)).not.toContain("IGNORE");
  });
});

describe("notes under the read-back", () => {
  it("says what happens when two conditions were joined", () => {
    const notes = readBackNotes({ combined: true, unsupported: [] });
    expect(notes).toEqual([
      "You said both together. I can't check both together, so I will make two rules. That is stricter: I will wait on every big buy and on every late-night buy.",
    ]);
  });
  it("lists the parts it can't do", () => {
    const notes = readBackNotes({ combined: false, unsupported: [{ reason: "category", quote: "shoes" }] });
    expect(notes[0]).toBe('About "shoes": I can\'t make a rule about a kind of thing yet. I can wait on big buys or late-night buys.');
  });
});

describe("a saved rule in plain words", () => {
  it("big buys, by strength", () => {
    expect(describeRule("big_buy", { cents: 5000, strength: "gentle" })).toBe("Wait on buys over $50. You can still tap Buy now.");
    expect(describeRule("big_buy", { cents: 5000, strength: "firm" })).toBe("Wait a day on buys over $50. I save it and remind you.");
    expect(describeRule("big_buy", { cents: 5000, strength: "firm", waitHours: 48 })).toBe("Wait 2 days on buys over $50. I save it and remind you.");
    expect(describeRule("big_buy", { cents: 5000, strength: "locked" })).toBe("Never buy things over $50.");
  });
  it("late-night buys, by strength", () => {
    expect(describeRule("late_night", { afterHour: 21, untilHour: 5, strength: "gentle" })).toBe("Wait on buys from 9pm to 5am. You can still tap Buy now.");
    expect(describeRule("late_night", { afterHour: 21, untilHour: 5, strength: "firm", waitHours: 24 })).toBe("Wait a day on buys from 9pm to 5am. I save it and remind you.");
    expect(describeRule("late_night", { afterHour: 21, untilHour: 5, strength: "locked" })).toBe("Never buy anything from 9pm to 5am.");
  });
});

describe("the three strengths, one line each", () => {
  it("is plain and different for each", () => {
    expect(strengthOneLiner("gentle")).toBe("I ask you: wait, or buy now? You can tap Buy now.");
    expect(strengthOneLiner("firm")).toBe("I save it for later. You can't buy it until the wait is over.");
    expect(strengthOneLiner("locked")).toBe("Never, while this rule is on. Only changing the rule can undo it, and that takes a day.");
  });
});

describe("questions and refusals", () => {
  it("asks for what is missing, one thing at a time", () => {
    expect(questionFor("amount")).toBe("How much is too much? Tell me a dollar amount, like $50.");
    expect(questionFor("hour")).toBe("What time should I start waiting? For example, 9pm.");
  });

  it("explains each thing it can't do", () => {
    const cases: [UnsupportedNote, RegExp][] = [
      [{ reason: "category" }, /kind of thing/],
      [{ reason: "store_or_brand" }, /store or a brand/],
      [{ reason: "budget_or_protected_money" }, /weekly plan or your rent/],
      [{ reason: "loosening" }, /only make rules stricter/],
      [{ reason: "not_a_rule" }, /rule about buying/],
      [{ reason: "other" }, /can't check that/],
    ];
    for (const [note, re] of cases) expect(unsupportedText(note)).toMatch(re);
  });

  it("quotes the user's own words when it has them", () => {
    expect(unsupportedText({ reason: "store_or_brand", quote: "Store X" })).toMatch(/^About "Store X": /);
  });
});

describe("reading level: short sentences, no jargon", () => {
  const JARGON = /\b(threshold|schema|enforce|parameter|invalid|configure|criteria|heuristic|algorithm|validate)\w*/i;
  const all = [
    readBack({ kind: "big_buy", cents: 5000, waitHours: 24 }),
    readBack({ kind: "late_night", afterHour: 21, untilHour: 5, suggested: "locked" }),
    ...readBackNotes({ combined: true, unsupported: [{ reason: "category" }, { reason: "store_or_brand" }, { reason: "budget_or_protected_money" }, { reason: "loosening" }, { reason: "not_a_rule" }, { reason: "other" }] }),
    describeRule("big_buy", { cents: 5000, strength: "firm" }),
    describeRule("late_night", { afterHour: 21, untilHour: 5, strength: "locked" }),
    ...(["gentle", "firm", "locked"] as const).map(strengthOneLiner),
    questionFor("amount"),
    questionFor("hour"),
  ];

  it.each(all)("%s", (text) => {
    expect(text).not.toMatch(JARGON);
    for (const sentence of text.split(/(?<=[.?!])\s+/)) {
      expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(24);
    }
  });
});
