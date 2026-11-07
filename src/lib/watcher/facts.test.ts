import { describe, expect, it } from "vitest";
import type { Watch } from "../ledger/types";
import { applyReading, candidatesFor, composeMessage, fallbackMessage, type Reading } from "./facts";

const NOW = new Date("2026-11-07T15:00:00Z");
const watch = (over: Partial<Watch> = {}): Watch => ({ productId: "H", name: "Over-Ear Headphones", imageUrl: "https://i/x.jpg", source: "chosen", startedAt: "2026-11-06T10:00:00.000Z", baselineCents: 34_900, lastCents: 34_900, lastAvailable: true, active: true, ...over });
const read = (over: Partial<Reading> = {}): Reading => ({ available: true, priceCents: 34_900, history: null, ...over });
const hist = (meanCents: number) => ({ minCents: meanCents - 2000, maxCents: meanCents + 5000, meanCents, status: "typical" as const, points: 10 });

describe("what might be worth telling the user", () => {
  it("nothing when the price is the same", () => {
    expect(candidatesFor(watch(), read())).toEqual([]);
  });

  it("a real drop: lower than when they started waiting, by at least 3 percent and a dollar", () => {
    const [c] = candidatesFor(watch(), read({ priceCents: 28_900 }));
    expect(c).toEqual({ kind: "drop", priceCents: 28_900, dropCents: 6000, dropPercent: 17, key: "drop:28900" });
  });

  it("a tiny drop is not news", () => {
    expect(candidatesFor(watch(), read({ priceCents: 34_850 }))).toEqual([]); // 50 cents
    expect(candidatesFor(watch({ baselineCents: 10_000 }), read({ priceCents: 9_800 }))).toEqual([]); // 2 percent
  });

  it("a price that went UP is never news", () => {
    expect(candidatesFor(watch(), read({ priceCents: 39_900 }))).toEqual([]);
  });

  it("the same news is not told twice", () => {
    expect(candidatesFor(watch({ lastNoticeKey: "drop:28900" }), read({ priceCents: 28_900 }))).toEqual([]);
  });

  it("a further drop is new news", () => {
    expect(candidatesFor(watch({ lastNoticeKey: "drop:28900", lastCents: 28_900 }), read({ priceCents: 25_000 }))).toHaveLength(1);
  });

  it("sold out, once", () => {
    expect(candidatesFor(watch(), read({ available: false, priceCents: null }))).toEqual([{ kind: "sold_out", key: "sold_out:0" }]);
    expect(candidatesFor(watch({ lastAvailable: false, lastNoticeKey: "sold_out:0" }), read({ available: false, priceCents: null }))).toEqual([]);
  });

  it("back in stock", () => {
    expect(candidatesFor(watch({ lastAvailable: false }), read())).toEqual([{ kind: "back_in_stock", priceCents: 34_900, key: "back_in_stock:34900" }]);
  });

  it("back to a normal price: it was high at the last check and now is near the usual price", () => {
    const w = watch({ lastCents: 42_000, baselineCents: 34_900 });
    const kinds = candidatesFor(w, read({ priceCents: 35_000, history: hist(34_500) })).map((c) => c.kind);
    expect(kinds).toEqual(["back_to_normal"]);
  });

  it("no normal-price news without a price history (tracking only builds up over time)", () => {
    expect(candidatesFor(watch({ lastCents: 42_000 }), read({ priceCents: 35_000 }))).toEqual([]);
  });

  it("a drop that is also back to normal gives both, for the AI to choose from", () => {
    const w = watch({ lastCents: 42_000, baselineCents: 40_000 });
    const kinds = candidatesFor(w, read({ priceCents: 34_500, history: hist(34_500) })).map((c) => c.kind).sort();
    expect(kinds).toEqual(["back_to_normal", "drop"]);
  });

  it("an item that could not be read (no price, still 'available') says nothing", () => {
    expect(candidatesFor(watch(), read({ priceCents: null }))).toEqual([]);
  });
});

describe("remembering what was seen", () => {
  it("records the price, stock and time", () => {
    const w = watch();
    applyReading(w, read({ priceCents: 30_000 }), NOW);
    expect(w).toMatchObject({ lastCents: 30_000, lastAvailable: true, lastCheckedAt: NOW.toISOString() });
  });
  it("sold out keeps the last price and records that it is gone", () => {
    const w = watch();
    applyReading(w, read({ available: false, priceCents: null }), NOW);
    expect(w).toMatchObject({ lastCents: 34_900, lastAvailable: false });
  });
});

describe("the words, with every price filled in by code", () => {
  const drop = candidatesFor(watch(), read({ priceCents: 28_900 }))[0];
  it("code's own words for each kind", () => {
    expect(fallbackMessage(watch(), drop)).toBe("The Over-Ear Headphones you waited on is $60.00 cheaper now. Still want it?");
    expect(fallbackMessage(watch(), { kind: "sold_out", key: "sold_out:0" })).toBe("The Over-Ear Headphones you waited on is sold out right now. I will tell you if it comes back.");
    expect(fallbackMessage(watch(), { kind: "back_in_stock", priceCents: 34_900, key: "k" })).toBe("The Over-Ear Headphones you waited on is back in stock at $349.00. Still want it?");
    expect(fallbackMessage(watch(), { kind: "back_to_normal", priceCents: 34_900, key: "k" })).toBe("The Over-Ear Headphones is back to a normal price: $349.00. Still want it?");
  });

  it("the helper's message gets its prices from placeholders that code fills from store values", () => {
    expect(composeMessage(watch(), drop, "Good news! {name} is {drop} cheaper, now {price} (was {was}). Still want it?")).toBe("Good news! Over-Ear Headphones is $60.00 cheaper, now $289.00 (was $349.00). Still want it?");
  });

  it("a message with its own number, price, link or number word is replaced by code's words", () => {
    for (const bad of ["{name} is $50 cheaper. Still want it?", "{name} dropped 17% today", "Visit shop.example for {name}", "{name} is three dollars cheaper", "{name}: {price} at 3pm"]) {
      expect(composeMessage(watch(), drop, bad), bad).toBe(fallbackMessage(watch(), drop));
    }
  });

  it("a placeholder the news doesn't have is not allowed (sold out has no price)", () => {
    expect(composeMessage(watch(), { kind: "sold_out", key: "k" }, "{name} is sold out, it was {price}")).toBe(fallbackMessage(watch(), { kind: "sold_out", key: "k" }));
  });

  it("an unknown placeholder, an empty message, or a long one falls back", () => {
    for (const bad of ["{secret} is cheaper", "", "x".repeat(300) + " {name}", "No name in this one."]) {
      expect(composeMessage(watch(), drop, bad), bad).toBe(fallbackMessage(watch(), drop));
    }
  });

  it("the product's name can't smuggle in markup (it is shown as plain text, with angle brackets removed)", () => {
    const m = fallbackMessage(watch({ name: "Thing <script>alert(1)</script>" }), drop);
    expect(m).not.toMatch(/[<>]/);
  });
});
