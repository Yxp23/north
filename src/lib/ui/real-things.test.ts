import { describe, expect, it } from "vitest";
import { realThings, realThingsSentence } from "./real-things";

describe("realThings", () => {
  it("says $72 is about 6 lunches", () => expect(realThings(7200)?.text).toBe("about 6 lunches"));
  it("uses coffees for small amounts and weeks of groceries for big ones", () => {
    expect(realThings(1000)?.text).toBe("about 2 coffees");
    expect(realThings(34900)?.text).toBe("about 3 weeks of groceries");
  });
  it("says nothing for tiny or unreadable amounts", () => {
    expect(realThings(499)).toBeNull();
    expect(realThings(Number.NaN)).toBeNull();
    expect(realThings(-5)).toBeNull();
  });
  it("never says zero of something", () => {
    expect(realThings(500)?.text).toBe("about 1 coffee");
    expect(realThings(1200)?.text).toBe("about 1 lunch");
  });
  it("makes a sentence", () => {
    expect(realThingsSentence(7200, "$72.00")).toBe("$72.00 is about 6 lunches.");
    expect(realThingsSentence(100, "$1.00")).toBe("");
  });
});
