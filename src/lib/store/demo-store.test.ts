import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getStore } from "./index";

// Real brand names we saw while picking products. Demo data must not show any of them.
const BANNED = ["zara", "muji", "koss", "anta", "public goods", "total home", "gildan", "hanes", "bather", "madewell", "zulay", "clarks", "lie studio", "beats", "paul mitchell", "hudson grace", "hydration nation", "old navy", "levo", "chilly"];

describe("demo store", () => {
  it("has about a dozen products", async () => {
    const products = await getStore().listProducts();
    expect(products.length).toBeGreaterThanOrEqual(10);
    expect(products.length).toBeLessThanOrEqual(14);
  });

  it("has valid, unique products with prices in whole cents", async () => {
    const products = await getStore().listProducts();
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    for (const p of products) {
      expect(Number.isSafeInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThan(0);
      expect(p.currency).toBe("USD");
      expect(p.imageUrl).toMatch(/^https:\/\//);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.category.length).toBeGreaterThan(0);
    }
  });

  it("uses our tracked Channel3 products where they fit", async () => {
    const tracked = Object.values(
      JSON.parse(readFileSync("data/tracked-products.json", "utf8")).groups,
    ).flat() as string[];
    const products = await getStore().listProducts();
    const flagged = products.filter((p) => p.tracked);
    expect(flagged.length).toBeGreaterThanOrEqual(2);
    // The headphones are the main big-buy and scam-check item, so they must have a price history.
    expect(flagged.map((p) => p.id)).toContain("ENVDwLq");
    for (const p of flagged) expect(tracked).toContain(p.id);
    for (const p of products.filter((p) => !p.tracked)) expect(tracked).not.toContain(p.id);
  });

  it("shows no real brand names in names or categories", async () => {
    for (const p of await getStore().listProducts()) {
      const text = `${p.name} ${p.category}`.toLowerCase();
      for (const brand of BANNED) expect(text).not.toContain(brand);
    }
  });

  it("has at least two items over $50, so the big-buy wait can trigger", async () => {
    const products = await getStore().listProducts();
    expect(products.filter((p) => p.priceCents > 5000).length).toBeGreaterThanOrEqual(2);
  });

  it("finds a product by id, and returns null for an unknown id", async () => {
    const store = getStore();
    const [first] = await store.listProducts();
    expect(await store.getProduct(first.id)).toEqual(first);
    expect(await store.getProduct("nope")).toBeNull();
  });

  it("searches by name and category, ignoring capital letters", async () => {
    const store = getStore();
    expect((await store.search("SPONGES")).map((p) => p.name)).toContain("Kitchen Sponges");
    expect((await store.search("clothes")).length).toBeGreaterThanOrEqual(2);
    expect(await store.search("   ")).toEqual([]);
    expect(await store.search("zzz-not-here")).toEqual([]);
  });
});
