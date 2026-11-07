import { describe, expect, it } from "vitest";
import { plainLine } from "./plain-text";

describe("a plain line from a model", () => {
  it("keeps a short plain sentence", () => expect(plainLine("  Soft and warm  ", 50)).toBe("Soft and warm"));
  it.each(["Only $5", "5 stars", "see https://x.example", "go to www.x.com", "mail me@x.com", "<b>hi</b>", "shop.example is great", ""])("drops %j", (s) => expect(plainLine(s, 80)).toBeNull());
  it("drops anything too long, and anything that is not text", () => {
    expect(plainLine("x".repeat(60), 50)).toBeNull();
    expect(plainLine(42, 50)).toBeNull();
  });
  it("number words are fine by default (a reason like 'one of the softest')", () => {
    expect(plainLine("One of the softest I found", 80)).toBe("One of the softest I found");
  });
  it("but can be refused too, when a count or an amount in words would not be checked", () => {
    for (const s of ["Here are your last three payments", "Two were refunded", "It costs fifty bucks", "About a dozen", "Half price now", "A hundred dollars"]) {
      expect(plainLine(s, 80, { noNumberWords: true }), s).toBeNull();
    }
    expect(plainLine("Yes, your order went through.", 80, { noNumberWords: true })).toBe("Yes, your order went through.");
  });
});
