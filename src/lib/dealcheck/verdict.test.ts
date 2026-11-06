import { describe, expect, it } from "vitest";
import { computeVerdict } from "./verdict";
import type { Evidence } from "./types";

// The verdict is plain code: the same evidence always gives the same answer. Every price in the words
// comes from the evidence (API values), never from model text.
const base: Evidence = {
  matched: true,
  productTitle: "Running Series Sneakers",
  claimedCents: 7500,
  offers: [{ domain: "kickscrew.com", cents: 7254 }, { domain: "garmentory.com", cents: 8100 }],
  history: null,
  seller: { domain: "kickscrew.com", known: true, lookalikeOf: null, odd: false },
};
const ev = (over: Partial<Evidence>): Evidence => ({ ...base, ...over });
const kind = (over: Partial<Evidence>) => computeVerdict(ev(over)).kind;

describe("price against the real stores", () => {
  it("a price near the lowest real price looks fine", () => {
    const v = computeVerdict(base);
    expect(v.kind).toBe("fine");
    expect(v.headline).toBe("This looks fine.");
  });

  it("a price far below every real price is not real: a scam", () => {
    const v = computeVerdict(ev({ claimedCents: 2700 }));
    expect(v.kind).toBe("scam");
    expect(v.headline).toBe("This looks like a scam.");
    expect(v.reasons[0]).toBe("This price isn't real. The lowest real price I found was $72.54. I wouldn't buy it.");
  });

  it("a price somewhat below the real price says be careful", () => {
    expect(kind({ claimedCents: 5000 })).toBe("careful"); // 69% of $72.54
  });

  it("a price above the real price is a price trap: careful, and it names the better price", () => {
    const v = computeVerdict(ev({ claimedCents: 12900 }));
    expect(v.kind).toBe("careful");
    expect(v.reasons[0]).toBe("This isn't a deal. You can get it for $72.54 at kickscrew.com.");
  });

  it("the edges: 50% and 80% and 115% of the lowest real price", () => {
    const lowest = 10000;
    const offers = [{ domain: "kickscrew.com", cents: lowest }];
    expect(kind({ offers, claimedCents: 4999 })).toBe("scam");
    expect(kind({ offers, claimedCents: 5000 })).toBe("careful");
    expect(kind({ offers, claimedCents: 7999 })).toBe("careful");
    expect(kind({ offers, claimedCents: 8000 })).toBe("fine");
    expect(kind({ offers, claimedCents: 11500 })).toBe("fine");
    expect(kind({ offers, claimedCents: 11501 })).toBe("careful");
  });

  it("uses the lowest of today's offers and the 30-day history", () => {
    const history = { minCents: 6000, maxCents: 9000, meanCents: 7500, status: "typical" as const, points: 12 };
    const v = computeVerdict(ev({ claimedCents: 2700, history }));
    expect(v.reasons[0]).toBe("This price isn't real. The lowest real price in 30 days was $60. I wouldn't buy it.");
    expect(v.evidence).toContain("Last 30 days: lowest $60, usual $75, highest $90.");
  });

  it("with no history yet, it says so plainly and still uses the stores", () => {
    const v = computeVerdict(base);
    expect(v.evidence).toContain("I don't have a price history for this yet.");
    expect(v.evidence).toContain("Stores today: lowest $72.54 at kickscrew.com. Next: $81 at garmentory.com.");
  });

  it("a made-up 'was' price is a trap even when the price is fine", () => {
    const v = computeVerdict(ev({ claimedCents: 7500, claimedWasCents: 29900 }));
    expect(v.kind).toBe("careful");
    expect(v.reasons.join(" ")).toContain("The old price in the ad looks made up.");
  });

  it("a believable 'was' price is fine", () => {
    expect(kind({ claimedCents: 7500, claimedWasCents: 9900 })).toBe("fine");
  });
});

describe("the seller", () => {
  it("a copy of a known seller's name is a scam, even at a normal price", () => {
    const v = computeVerdict(ev({ seller: { domain: "kickscrew-outlet.shop", known: false, lookalikeOf: "kickscrew.com", odd: false } }));
    expect(v.kind).toBe("scam");
    expect(v.reasons.join(" ")).toContain("kickscrew-outlet.shop looks like a copy of kickscrew.com.");
  });

  it("an unknown seller with a normal price: be careful", () => {
    const v = computeVerdict(ev({ seller: { domain: "randomshop.example", known: false, lookalikeOf: null, odd: false } }));
    expect(v.kind).toBe("careful");
    expect(v.reasons.join(" ")).toContain("randomshop.example is not a store I know.");
  });

  it("an unknown seller with a too-good price is a scam", () => {
    expect(kind({ claimedCents: 5000, seller: { domain: "randomshop.example", known: false, lookalikeOf: null, odd: false } })).toBe("scam");
  });

  it("an odd-looking address makes a fine price careful", () => {
    expect(kind({ seller: { domain: "192.168.4.5", known: false, lookalikeOf: null, odd: true } })).toBe("careful");
  });

  it("no seller named: says it doesn't know who sells it, but doesn't worry about it", () => {
    const v = computeVerdict(ev({ seller: { domain: null, known: false, lookalikeOf: null, odd: false } }));
    expect(v.kind).toBe("fine");
    expect(v.evidence).toContain("I don't know who is selling it.");
  });

  it("only a scam verdict with a seller flags that seller", () => {
    expect(computeVerdict(ev({ claimedCents: 2700 })).flagSeller).toBe(true);
    expect(computeVerdict(ev({ claimedCents: 2700, seller: { domain: null, known: false, lookalikeOf: null, odd: false } })).flagSeller).toBe(false);
    expect(computeVerdict(base).flagSeller).toBe(false);
    expect(computeVerdict(ev({ claimedCents: 5000 })).flagSeller).toBe(false); // careful, not scam
  });
});

describe("a product that is only like the ad, not exactly it", () => {
  const similar = (over: Partial<Evidence> = {}) => ev({ similar: true, offers: [{ domain: "kickscrew.com", cents: 7254 }, { domain: "academy.com", cents: 6499 }], ...over });

  it("is never 'fine': we can't be sure it is the same thing", () => {
    for (const claimedCents of [2700, 5000, 6500, 7500, 20000]) {
      expect(computeVerdict(similar({ claimedCents })).kind, `$${claimedCents / 100}`).not.toBe("fine");
    }
  });

  it("a price far below the same kind of product: careful, with the lowest similar price and the honest limit", () => {
    const v = computeVerdict(similar({ claimedCents: 2700, seller: { domain: null, known: false, lookalikeOf: null, odd: false } }));
    expect(v).toMatchObject({ kind: "careful", code: "price_too_low_similar", flagSeller: false });
    expect(v.reasons[0]).toBe("This price is much lower than I found for the same kind of product. The lowest I found was $64.99. I couldn't find this exact product, so I can't be sure.");
  });

  it("a normal-looking price: careful, because it can only be compared to similar products", () => {
    const v = computeVerdict(similar({ claimedCents: 6900 }));
    expect(v.kind).toBe("careful");
    expect(v.reasons[0]).toBe("I couldn't find this exact product, so I can only compare it to similar ones. The lowest price I found for similar ones was $64.99.");
  });

  it("a too-good price from a seller I don't know is a scam, and that seller is flagged", () => {
    const v = computeVerdict(similar({ claimedCents: 2700, seller: { domain: "cheap-kicks-outlet.example", known: false, lookalikeOf: null, odd: false } }));
    expect(v).toMatchObject({ kind: "scam", flagSeller: true });
  });

  it("a high price is not called a trap (we can't compare it fairly)", () => {
    expect(computeVerdict(similar({ claimedCents: 20000 })).code).toBe("similar_only");
  });

  it("the evidence names the similar stores, never an exact match", () => {
    const v = computeVerdict(similar({ claimedCents: 6900 }));
    expect(v.evidence).toContain("Similar products today: lowest $64.99 at academy.com. Next: $72.54 at kickscrew.com.");
  });
});

describe("things it can't check", () => {
  it("a product it can't find: be careful, and it says it can't check the price", () => {
    const v = computeVerdict(ev({ matched: false, offers: [], productTitle: undefined }));
    expect(v.kind).toBe("careful");
    expect(v.reasons[0]).toBe("I couldn't find this at any store I know, so I can't check the price.");
  });

  it("a product nobody has in stock: be careful", () => {
    const v = computeVerdict(ev({ offers: [] }));
    expect(v.kind).toBe("careful");
    expect(v.reasons[0]).toBe("I can't find it in stock anywhere I look, so I can't check the price.");
  });

  it("not found, and the seller is a copy of a known one: still a scam", () => {
    expect(kind({ matched: false, offers: [], seller: { domain: "kickscrew.net", known: false, lookalikeOf: "kickscrew.com", odd: false } })).toBe("scam");
  });

  it("no price in the ad: be careful", () => {
    expect(kind({ claimedCents: null })).toBe("careful");
  });

  it("a nonsense price is never trusted", () => {
    expect(kind({ claimedCents: 0 })).toBe("careful");
    expect(kind({ claimedCents: -5 })).toBe("careful");
    expect(kind({ claimedCents: 10.5 })).toBe("careful");
  });
});

describe("the words", () => {
  it("every dollar amount in the words appears in the evidence we were given", () => {
    const v = computeVerdict(ev({ claimedCents: 2700, claimedWasCents: 29900 }));
    const allowed = new Set(["$27", "$72.54", "$81", "$299"]);
    for (const m of [...v.reasons, ...v.evidence].join(" ").matchAll(/\$[\d,]+(?:\.\d+)?/g)) expect(allowed.has(m[0]), m[0]).toBe(true);
  });

  it("is deterministic", () => {
    expect(computeVerdict(base)).toEqual(computeVerdict(structuredClone(base)));
  });
});
