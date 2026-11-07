import { describe, expect, it } from "vitest";
import { shelfItemOf, storeFindBackend } from "./adapter";
import { DemoStore } from "../store/demo-store";
import type { StoreProduct, StoreProvider } from "../store";

const product: StoreProduct = {
  id: "P1", name: "Lamp", category: "lamps", priceCents: 1500, currency: "USD", imageUrl: "https://i/x.jpg", tracked: false, sellerDomain: "a.com",
  offers: [{ domain: "a.com", cents: 1500 }, { domain: "b.com", cents: 1800 }], sizes: ["S"],
};

describe("store products on the shelf", () => {
  it("takes the lowest price and its store, the number of stores, and the sizes", () => {
    expect(shelfItemOf(product)).toEqual({ id: "P1", name: "Lamp", category: "lamps", imageUrl: "https://i/x.jpg", priceCents: 1500, domain: "a.com", storeCount: 2, sizes: ["S"] });
  });
  it("a demo product with no offer list is one store", () => {
    const { offers, ...plain } = product;
    void offers;
    expect(shelfItemOf({ ...plain, sellerDomain: undefined })).toMatchObject({ domain: "the demo shop", storeCount: 1 });
  });
  it("search and picture search go through the store", async () => {
    const store: StoreProvider = {
      listProducts: async () => [], getProduct: async () => null,
      search: async (q, n) => (q === "lamp" ? [product].slice(0, n) : []),
      searchByPicture: async () => { throw new Error("down"); },
    };
    const b = storeFindBackend(store);
    expect((await b.search("lamp", 5)).map((i) => i.id)).toEqual(["P1"]);
    await expect(b.searchByPicture("AAAA", 5)).rejects.toThrow();
  });
  it("works on the offline demo store", async () => {
    expect((await storeFindBackend(new DemoStore()).search("shampoo", 3))[0].name).toBe("Mild Shampoo");
  });
});
