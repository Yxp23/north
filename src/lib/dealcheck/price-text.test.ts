import { describe, expect, it } from "vitest";
import { extractPricesCents, itemPricesCents, percentOff } from "./price-text";

describe("prices written in an ad (found by code)", () => {
  it.each([
    ["70% off sneakers, $27", [2700]],
    ["Now $1,299.00 (was $2,499)", [129900, 249900]],
    ["only 27 dollars!", [2700]],
    ["USD 27.50 today", [2750]],
    ["$0.99 each", [99]],
    ["3 for $60", [6000]],
    ["no price here, 70% off", []],
    ["call 555-1234 now", []],
  ])("%s", (text, want) => {
    expect(extractPricesCents(text)).toEqual(want);
  });

  it("ignores amounts that make no sense", () => {
    expect(extractPricesCents("$99999999999")).toEqual([]);
    expect(extractPricesCents("$0")).toEqual([]);
  });

  it("finds a percent off", () => {
    expect(percentOff("70% off today")).toBe(70);
    expect(percentOff("save 15 percent")).toBe(15);
    expect(percentOff("no discount")).toBeNull();
  });
});

describe("the price of the item itself (not savings, shipping or fees)", () => {
  it.each([
    ["Sneakers $74 — save $15 today", [7400]],
    ["Now only $72! Save $20", [7200]],
    ["Only $27, was $90", [2700, 9000]],
    ["$27 plus $5 shipping", [2700]],
    ["$20 off! Now $72", [7200]],
    ["Take $10 off your order: $64", [6400]],
    ["$15 discount, $59 total", [5900]],
    ["Get a $5 coupon. Price $40", [4000]],
    ["Sneakers $27", [2700]],
    ["Save $20 on shipping", []],
  ])("%s", (text, want) => {
    expect(itemPricesCents(text)).toEqual(want);
  });
});
