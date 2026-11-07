import { describe, expect, it } from "vitest";
import { ourCategory, sizesOf, stripBrands, toStoreProduct, type RawStoreProduct } from "./map";

const offer = (domain: string, price: number, extra: object = {}) => ({ domain, price: { price, currency: "USD" }, availability: "InStock", ...extra });
const raw = (over: Partial<RawStoreProduct> = {}): RawStoreProduct => ({
  id: "AbC123",
  title: "Women's Anthem Running Shoes",
  brands: [{ name: "Brooks" }],
  images: [{ url: "https://cdn.example.com/a.jpg" }, { url: "https://cdn.example.com/main.jpg", is_main_image: true }],
  offers: [offer("big-store.com", 89.99), offer("small-shop.com", 79.5), offer("www.third.com", 99)],
  category: { title: "Athletic Shoes", path: [{ title: "Apparel & Accessories" }, { title: "Shoes" }, { title: "Athletic Shoes" }] },
  ...over,
});

describe("a Channel3 product becomes a store product", () => {
  it("takes the lowest in-stock offer as THE price, in whole cents", () => {
    const p = toStoreProduct(raw())!;
    expect(p.priceCents).toBe(7950);
    expect(p.sellerDomain).toBe("small-shop.com");
    expect(p.currency).toBe("USD");
    expect(p.live).toBe(true);
  });

  it("lists every in-stock offer, cheapest first (the www. is dropped)", () => {
    expect(toStoreProduct(raw())!.offers).toEqual([
      { domain: "small-shop.com", cents: 7950 },
      { domain: "big-store.com", cents: 8999 },
      { domain: "third.com", cents: 9900 },
    ]);
  });

  it("leaves out offers that are out of stock, in another currency, or have no usable price", () => {
    const p = toStoreProduct(raw({ offers: [offer("a.com", 5, { availability: "OutOfStock" }), { domain: "b.com", price: { price: 5, currency: "EUR" }, availability: "InStock" }, offer("c.com", 0), offer("d.com", 12)] }))!;
    expect(p.offers).toEqual([{ domain: "d.com", cents: 1200 }]);
  });

  it("is not a product at all when nothing is in stock (so it can't be bought)", () => {
    expect(toStoreProduct(raw({ offers: [offer("a.com", 5, { availability: "OutOfStock" })] }))).toBeNull();
    expect(toStoreProduct(raw({ offers: [] }))).toBeNull();
  });

  it("needs a picture and a safe id", () => {
    expect(toStoreProduct(raw({ images: [] }))).toBeNull();
    expect(toStoreProduct(raw({ images: [{ url: "http://insecure.example.com/a.jpg" }] }))).toBeNull();
    expect(toStoreProduct(raw({ id: "../../etc" }))).toBeNull();
  });

  it("uses the main picture", () => {
    expect(toStoreProduct(raw())!.imageUrl).toBe("https://cdn.example.com/main.jpg");
  });

  it("shows no brand name in the name", () => {
    expect(toStoreProduct(raw({ title: "Brooks Anthem 8 Running Shoes by Brooks" }))!.name).toBe("Anthem 8 Running Shoes");
  });

  it("keeps the seller's description as untrusted text, cut short", () => {
    expect(toStoreProduct(raw({ description: "x".repeat(5000) }))!.description).toHaveLength(1500);
  });
});

describe("brand names are taken out of names", () => {
  it.each([
    ["Nike Air Zoom Shoes", ["Nike"], "Air Zoom Shoes"],
    ["Levi's 501 Jeans", [{ name: "Levi's" }], "501 Jeans"],
    ["Acme's Best Kettle", ["Acme"], "Best Kettle"],
    ["Plain Cotton Towel", [{ name: "Acme" }], "Plain Cotton Towel"],
    ["Big Sale: Acme - Kettle", ["Acme"], "Big Sale: Kettle"],
  ])("%s", (title, brands, out) => {
    expect(stripBrands(title, brands as never)).toBe(out);
  });
  it("a brand that is part of a longer word stays", () => {
    expect(stripBrands("Acmeist Kettle", ["Acme"])).toBe("Acmeist Kettle");
  });
  it("never leaves an empty name", () => {
    expect(stripBrands("Acme", ["Acme"])).toBe("");
    expect(toStoreProduct(raw({ title: "Brooks", category: { title: "Kettles" } }))!.name).toBe("Kettles");
  });
});

describe("our category (which the Money Guardian's must-have list is matched against)", () => {
  it.each([
    [["Health & Beauty", "Personal Care", "Hair Care", "Shampoo & Conditioner"], "personal care"],
    [["Health & Beauty", "Health Care", "Medicine & Drugs"], "medicine"],
    [["Food, Beverages & Tobacco", "Food Items", "Snacks"], "groceries"],
    [["Home & Garden", "Household Supplies", "Household Cleaning"], "household"],
    [["Apparel & Accessories", "Shoes", "Athletic Shoes"], "shoes"],
    [["Apparel & Accessories", "Clothing", "Shirts"], "clothes"],
    [["Electronics", "Audio", "Headphones"], "electronics"],
    [["Toys & Games", "Puzzles"], "puzzles"],
    [[], "other"],
  ])("%j -> %s", (path, out) => expect(ourCategory(path)).toBe(out));

  it("tobacco and alcohol are never 'groceries'", () => {
    expect(ourCategory(["Food, Beverages & Tobacco", "Tobacco Products", "Cigars"])).toBe("cigars");
    expect(ourCategory(["Food, Beverages & Tobacco", "Beverages", "Alcoholic Beverages", "Wine"])).toBe("wine");
  });

  it("makeup is not 'personal care'", () => {
    expect(ourCategory(["Health & Beauty", "Personal Care", "Cosmetics", "Lipstick"])).toBe("lipstick");
  });

  it("a pricey item can't be a must-have, whatever its category says (a wrong label must never loosen the rules)", () => {
    const cheap = toStoreProduct(raw({ offers: [offer("a.com", 20)], category: { path: [{ title: "Health & Beauty" }, { title: "Personal Care" }, { title: "Shampoo" }] } }))!;
    const pricey = toStoreProduct(raw({ offers: [offer("a.com", 300)], category: { path: [{ title: "Health & Beauty" }, { title: "Personal Care" }, { title: "Shampoo" }] } }))!;
    expect(cheap.category).toBe("personal care");
    expect(pricey.category).toBe("shampoo");
  });
});

describe("sizes", () => {
  const withSizes = (values: { label: string; exists?: boolean }[]) => raw({ variants: { options: [{ name: "Color", values: [{ label: "Red" }] }, { name: "Size", values }] } });
  it("lists the sizes that exist", () => {
    expect(sizesOf(withSizes([{ label: "7" }, { label: "8", exists: true }, { label: "9", exists: false }]))).toEqual(["7", "8"]);
  });
  it("is undefined when the product has no size choice", () => {
    expect(sizesOf(raw())).toBeUndefined();
    expect(sizesOf(raw({ variants: { options: [{ name: "Color", values: [{ label: "Red" }] }] } }))).toBeUndefined();
  });
  it("ends up on the store product", () => {
    expect(toStoreProduct(withSizes([{ label: "8" }]))!.sizes).toEqual(["8"]);
  });
});
