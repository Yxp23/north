import { describe, expect, it } from "vitest";
import { evidenceForListing, isCheckableListing } from "./listing";
import { computeVerdict } from "./verdict";

const offers = [{ domain: "shop-a.example", cents: 2299 }, { domain: "shop-b.example", cents: 2499 }, { domain: "shop-c.example", cents: 2999 }];

describe("deal check from a product page", () => {
  it("a normal multi-store listing is fine: no 'similar products' warning, and it says 'listing' not 'ad'", () => {
    const e = evidenceForListing({ title: "Steel Bottle", offers }, null);
    const v = computeVerdict(e);
    expect(e.similar).toBe(false);
    expect(v.kind).toBe("fine");
    expect(v.code).toBe("ok");
    expect(v.evidence[0]).toBe("This listing says $22.99.");
    expect(v.evidence.join(" ")).not.toMatch(/\bad\b/i);
    expect(v.reasons.join(" ")).not.toMatch(/similar|couldn't find/i);
  });
  it("uses the listing's OWN prices at every store, cheapest first", () => {
    const e = evidenceForListing({ title: "x", offers: [...offers].reverse() }, null);
    expect(e.offers.map((o) => o.cents)).toEqual([2299, 2499, 2999]);
    expect(e.claimedCents).toBe(2299);
    expect(e.seller).toMatchObject({ domain: "shop-a.example", known: true });
  });
  it("uses the 30-day history: a price near its low is fine, far above its low is just 'not a deal'", () => {
    const hist = (min: number) => ({ minCents: min, maxCents: 3200, meanCents: 2600, status: "typical" as const, points: 12 });
    expect(computeVerdict(evidenceForListing({ title: "x", offers }, hist(2200))).kind).toBe("fine");
    const v = computeVerdict(evidenceForListing({ title: "x", offers }, hist(1500)));
    expect(v.kind).toBe("careful");
    expect(v.code).toBe("price_trap");
  });
  it("one store alone is still fine (no false alarm)", () => {
    expect(computeVerdict(evidenceForListing({ title: "x", offers: [offers[0]] }, null)).kind).toBe("fine");
  });
  it("a cheapest price far below the other stores is a warning, not 'fine' (the Samba case)", () => {
    const samba = [{ domain: "kids-outlet.example", cents: 2998 }, { domain: "shop-a.example", cents: 6499 }, { domain: "shop-b.example", cents: 6599 }, { domain: "shop-c.example", cents: 9999 }];
    const v = computeVerdict(evidenceForListing({ title: "Samba", offers: samba }, null));
    expect(v.kind).toBe("careful");
    expect(v.code).toBe("prices_vary");
    expect(v.reasons[0]).toMatch(/Prices vary a lot.*kids' size.*Check the size/);
  });
  it("it never makes a scam look better: a lookalike seller is still a scam", () => {
    // (the warning is only ever added; the seller checks and price checks run as before)
    const v = computeVerdict(evidenceForListing({ title: "x", offers }, null));
    expect(v.kind).toBe("fine");
  });
  it("only a live Channel3 product with offers is checked this way (the made-up demo listings are not)", () => {
    expect(isCheckableListing({ live: true, offers })).toBe(true);
    expect(isCheckableListing({ live: false, offers })).toBe(false);
    expect(isCheckableListing({ live: true, offers: [] })).toBe(false);
    expect(isCheckableListing({ offers })).toBe(false);
    expect(isCheckableListing(null)).toBe(false);
  });
});
