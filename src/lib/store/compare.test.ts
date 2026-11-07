import { describe, expect, it } from "vitest";
import { compareStores } from "./compare";

describe("comparing stores", () => {
  it("lists every store, cheapest first, and marks the cheapest 'You pay this'", () => {
    const c = compareStores([{ domain: "b.com", cents: 900 }, { domain: "a.com", cents: 700 }, { domain: "c.com", cents: 1000 }]);
    expect(c.rows.map((r) => r.domain)).toEqual(["a.com", "b.com", "c.com"]);
    expect(c.rows.map((r) => r.youPay)).toEqual([true, false, false]);
  });

  it("says how much you save against the most expensive store", () => {
    const c = compareStores([{ domain: "a.com", cents: 700 }, { domain: "c.com", cents: 1000 }]);
    expect(c.saveCents).toBe(300);
  });

  it("each other store says how much more it costs", () => {
    const c = compareStores([{ domain: "a.com", cents: 700 }, { domain: "b.com", cents: 900 }, { domain: "c.com", cents: 1000 }]);
    expect(c.rows.map((r) => r.moreCents)).toEqual([0, 200, 300]);
  });

  it("one store: nothing to save", () => {
    const c = compareStores([{ domain: "a.com", cents: 700 }]);
    expect(c.saveCents).toBe(0);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].youPay).toBe(true);
  });

  it("all the same price: nothing to save", () => {
    expect(compareStores([{ domain: "a.com", cents: 700 }, { domain: "b.com", cents: 700 }]).saveCents).toBe(0);
  });

  it("the same price in two stores: the first alphabetically is the one you pay", () => {
    const c = compareStores([{ domain: "z.com", cents: 700 }, { domain: "a.com", cents: 700 }]);
    expect(c.rows.map((r) => [r.domain, r.youPay])).toEqual([["a.com", true], ["z.com", false]]);
  });

  it("no stores: nothing", () => {
    expect(compareStores([])).toEqual({ rows: [], saveCents: 0 });
  });

  it("shows the first six stores and says how many more there are", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ domain: `s${i}.com`, cents: 100 + i }));
    const c = compareStores(many);
    expect(c.rows).toHaveLength(6);
    expect(c.hiddenCount).toBe(3);
    expect(c.saveCents).toBe(8); // still against the true highest
  });
});
