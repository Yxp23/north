import { describe, expect, it } from "vitest";
import { toCandidate, toHistoryFacts } from "./channel3-map";

describe("Channel3 products -> candidates (prices become whole cents, in-stock only)", () => {
  const product = {
    id: "P1",
    title: "Running Series Sneakers",
    offers: [
      { domain: "kickscrew.com", price: { price: 72.54, currency: "USD" }, availability: "InStock" },
      { domain: "outofstock.example", price: { price: 50, currency: "USD" }, availability: "OutOfStock" },
      { domain: "euro.example", price: { price: 60, currency: "EUR" }, availability: "InStock" },
      { domain: "weird.example", price: { price: -5, currency: "USD" }, availability: "InStock" },
      { domain: "Academy.com", price: { price: 64.99, currency: "USD" }, availability: "in_stock" },
    ],
  };

  it("keeps only in-stock USD offers with sane prices, and cleans the domain", () => {
    expect(toCandidate(product)).toEqual({
      id: "P1",
      title: "Running Series Sneakers",
      offers: [{ domain: "kickscrew.com", cents: 7254 }, { domain: "academy.com", cents: 6499 }],
    });
  });

  it("rounds like a person: 19.99 is 1999 cents, not 1998", () => {
    const c = toCandidate({ id: "x", title: "t", offers: [{ domain: "a.example", price: { price: 19.99, currency: "USD" }, availability: "InStock" }] });
    expect(c.offers[0].cents).toBe(1999);
  });

  it("a product with no offers has an empty list", () => {
    expect(toCandidate({ id: "x", title: "t" }).offers).toEqual([]);
  });

  it("a very long title is cut short", () => {
    expect(toCandidate({ id: "x", title: "a".repeat(500) }).title.length).toBeLessThanOrEqual(120);
  });
});

describe("Channel3 price history -> facts", () => {
  const stats = { current_price: 72.54, min_price: 69, max_price: 89.5, mean: 76.25, current_status: "typical" as const };

  it("turns dollars into cents and counts the points", () => {
    expect(toHistoryFacts({ history: [{}, {}, {}], statistics: stats })).toEqual({ minCents: 6900, maxCents: 8950, meanCents: 7625, status: "typical", points: 3 });
  });

  it("no statistics or no points means no history yet", () => {
    expect(toHistoryFacts({ history: [], statistics: null })).toBeNull();
    expect(toHistoryFacts({ history: [{}], statistics: null })).toBeNull();
    expect(toHistoryFacts({ history: [], statistics: stats })).toBeNull();
    expect(toHistoryFacts(null)).toBeNull();
  });

  it("nonsense numbers mean no history", () => {
    expect(toHistoryFacts({ history: [{}], statistics: { ...stats, min_price: -1 } })).toBeNull();
    expect(toHistoryFacts({ history: [{}], statistics: { ...stats, mean: Number.NaN } })).toBeNull();
  });
});
