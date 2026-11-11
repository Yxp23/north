import { describe, expect, it } from "vitest";
import { compareStores } from "./compare";
import { pricesVary } from "./spread";

const offers = (...dollars: number[]) => dollars.map((d, i) => ({ domain: `shop-${i}.example`, cents: Math.round(d * 100) }));

describe("a cheapest price that is far below the other stores", () => {
  it("the Samba case: $29.98 when the others are about $65 and $100 is flagged", () => {
    expect(pricesVary(offers(29.98, 64.99, 65, 66, 99.99))).toBe(true);
  });
  it("ordinary differences between stores are not flagged", () => {
    expect(pricesVary(offers(62, 65, 66, 70))).toBe(false);
    expect(pricesVary(offers(45, 65, 66, 70))).toBe(false); // about 69%: a good deal, not suspicious
  });
  it("the line is 60% of the typical price", () => {
    expect(pricesVary(offers(39, 65, 65))).toBe(false); // exactly 60% is not "under" it
    expect(pricesVary(offers(38.99, 65, 65))).toBe(true);
    expect(pricesVary(offers(39.01, 65, 65))).toBe(false);
  });
  it("with two stores it compares with the other one; one store alone is never flagged", () => {
    expect(pricesVary(offers(29.98, 65))).toBe(true);
    expect(pricesVary(offers(60, 65))).toBe(false);
    expect(pricesVary(offers(29.98))).toBe(false);
    expect(pricesVary([])).toBe(false);
  });
  it("odd numbers can't break it", () => {
    expect(pricesVary([{ cents: 0 }, { cents: 100 }, { cents: 100 }])).toBe(false);
    expect(pricesVary([{ cents: Number.NaN }, { cents: 100 }])).toBe(false);
  });
});

describe("the store comparison says so", () => {
  it("flags it, and still lists every store cheapest first", () => {
    const c = compareStores(offers(65, 29.98, 66, 100));
    expect(c.varies).toBe(true);
    expect(c.rows[0].cents).toBe(2998);
  });
  it("a normal comparison is not flagged", () => {
    expect(compareStores(offers(65, 66, 70)).varies).toBe(false);
  });
});
