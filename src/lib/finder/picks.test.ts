import { describe, expect, it } from "vitest";
import { Shelf } from "./shelf";
import { checkPicks, PICKS_WANTED } from "./picks";
import type { ShelfItem } from "./types";

const item = (id: string, priceCents: number): ShelfItem => ({ id, name: `Thing ${id}`, category: "c", imageUrl: "https://i/x.jpg", priceCents, domain: "a.com", storeCount: 2 });
const shelfOf = (...items: ShelfItem[]) => {
  const s = new Shelf();
  s.add(items);
  return s;
};
const ok = (handle: string) => ({ handle, reason: "Soft and warm" });

describe("checking the picks the model made", () => {
  it("keeps the model's order and takes the price from the store, not from the model", () => {
    const shelf = shelfOf(item("A", 1000), item("B", 2000), item("C", 3000));
    const r = checkPicks({ shelf, chosen: [ok("p3"), ok("p1"), ok("p2")], leftCents: 10_000 });
    expect(r.picks.map((p) => [p.item.id, p.item.priceCents])).toEqual([["C", 3000], ["A", 1000], ["B", 2000]]);
    expect(r.problem).toBeUndefined();
  });

  it("wants exactly three", () => {
    expect(PICKS_WANTED).toBe(3);
    const shelf = shelfOf(item("A", 1), item("B", 2), item("C", 3), item("D", 4));
    const r = checkPicks({ shelf, chosen: ["p1", "p2", "p3", "p4"].map(ok), leftCents: 10_000 });
    expect(r.picks).toHaveLength(3);
  });

  it("drops a pick that costs more than the money left this week", () => {
    const shelf = shelfOf(item("A", 1000), item("B", 9000), item("C", 500));
    const r = checkPicks({ shelf, chosen: [ok("p1"), ok("p2"), ok("p3")], leftCents: 2000 });
    expect(r.picks.map((p) => p.item.id)).toEqual(["A", "C"]);
  });

  it("a price exactly equal to the money left fits", () => {
    expect(checkPicks({ shelf: shelfOf(item("A", 2000)), chosen: [ok("p1")], leftCents: 2000 }).picks).toHaveLength(1);
  });

  it("drops handles that are not on the shelf, and repeats", () => {
    const shelf = shelfOf(item("A", 1000), item("B", 1000), item("C", 1000));
    const r = checkPicks({ shelf, chosen: [ok("p1"), ok("p1"), ok("p9"), ok("A"), ok("p2")], leftCents: 5000 });
    expect(r.picks.map((p) => p.item.id)).toEqual(["A", "B"]);
  });

  it("asks the model to fix it when fewer than three are picked but three would fit", () => {
    const shelf = shelfOf(item("A", 1000), item("B", 9000), item("C", 500), item("D", 700), item("E", 800));
    const r = checkPicks({ shelf, chosen: [ok("p1"), ok("p2")], leftCents: 2000 });
    expect(r.picks.map((p) => p.item.id)).toEqual(["A"]);
    expect(r.problem).toMatch(/p3, p4, p5/); // the ones that fit and are not picked yet
    expect(r.problem).toMatch(/exactly 3/i);
  });

  it("is happy with fewer than three when fewer than three fit", () => {
    const shelf = shelfOf(item("A", 1000), item("B", 9000), item("C", 9500));
    const r = checkPicks({ shelf, chosen: [ok("p1")], leftCents: 2000 });
    expect(r.picks).toHaveLength(1);
    expect(r.problem).toBeUndefined();
  });

  it("a reason with a number, a price or a link is replaced by plain words that code wrote", () => {
    const shelf = shelfOf(item("A", 1000));
    const bad = checkPicks({ shelf, chosen: [{ handle: "p1", reason: "Only $5 today, see https://x.example" }], leftCents: 5000 }).picks[0];
    expect(bad.fromHelper).toBe(false);
    expect(bad.reason).toMatch(/lowest price/i);
    expect(bad.reason).not.toMatch(/\$|https/);
    const good = checkPicks({ shelf, chosen: [{ handle: "p1", reason: "Warm and soft for cold feet" }], leftCents: 5000 }).picks[0];
    expect(good).toMatchObject({ fromHelper: true, reason: "Warm and soft for cold feet" });
  });

  it("a long reason is replaced too", () => {
    const shelf = shelfOf(item("A", 1000));
    expect(checkPicks({ shelf, chosen: [{ handle: "p1", reason: "x ".repeat(100) }], leftCents: 5000 }).picks[0].fromHelper).toBe(false);
  });

  it("reports what fits at all, for the 'nothing fits' answer", () => {
    const shelf = shelfOf(item("A", 9000), item("B", 7000));
    const r = checkPicks({ shelf, chosen: [ok("p1")], leftCents: 2000 });
    expect(r.picks).toEqual([]);
    expect(r.fitCount).toBe(0);
    expect(r.cheapestCents).toBe(7000);
    expect(r.problem).toBeUndefined(); // nothing to fix: nothing fits
  });

  it("no money left at all: nothing fits", () => {
    const r = checkPicks({ shelf: shelfOf(item("A", 100)), chosen: [ok("p1")], leftCents: 0 });
    expect(r.picks).toEqual([]);
  });
});
