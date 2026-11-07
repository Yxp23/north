import { describe, expect, it, vi } from "vitest";
import { DemoStore } from "./demo-store";
import { LiveStore, type StoreSource } from "./live-store";
import type { RawStoreProduct } from "./map";

const offer = (domain: string, price: number, availability = "InStock") => ({ domain, price: { price, currency: "USD" }, availability });
const raw = (id: string, over: Partial<RawStoreProduct> = {}): RawStoreProduct => ({
  id, title: `Thing ${id}`, images: [{ url: "https://cdn.example.com/x.jpg", is_main_image: true }], offers: [offer("a.com", 10), offer("b.com", 12)],
  category: { path: [{ title: "Home & Garden" }, { title: "Lamps" }] }, ...over,
});

function setup(over: Partial<StoreSource> = {}) {
  const source = {
    search: vi.fn<StoreSource["search"]>(async () => [raw("N1"), raw("N2")]),
    get: vi.fn<StoreSource["get"]>(async (id) => raw(id)),
  };
  if (over.search) source.search.mockImplementation(over.search);
  if (over.get) source.get.mockImplementation(over.get);
  return { source, store: new LiveStore(source, new DemoStore()) };
}

describe("any store result can be bought at its live price", () => {
  it("a product that is not in the demo list is read from the live store", async () => {
    const { store } = setup();
    const p = await store.getProduct("NEWTHING");
    expect(p).toMatchObject({ id: "NEWTHING", priceCents: 1000, sellerDomain: "a.com", live: true });
  });

  it("`fresh` asks the store for a fresh read; the normal read may use the 10-minute cache", async () => {
    const { source, store } = setup();
    await store.getProduct("X1");
    await store.getProduct("X1", { fresh: true });
    expect(source.get.mock.calls).toEqual([["X1", { fresh: false }], ["X1", { fresh: true }]]);
  });

  it("the price follows the live store (it went up, so the price went up)", async () => {
    let price = 10;
    const { store } = setup({ get: async (id) => raw(id, { offers: [offer("a.com", price)] }) });
    expect((await store.getProduct("X1"))!.priceCents).toBe(1000);
    price = 13.5;
    expect((await store.getProduct("X1", { fresh: true }))!.priceCents).toBe(1350);
  });

  it("is not buyable when nothing is in stock, and not found when the store has never heard of it", async () => {
    const out = setup({ get: async (id) => raw(id, { offers: [offer("a.com", 10, "OutOfStock")] }) });
    expect(await out.store.getProduct("X1")).toBeNull();
    const gone = setup({ get: async () => null });
    expect(await gone.store.getProduct("X1")).toBeNull();
  });

  it("an odd product id never reaches the store", async () => {
    const { source, store } = setup();
    expect(await store.getProduct("../../secret")).toBeNull();
    expect(await store.getProduct("")).toBeNull();
    expect(source.get).not.toHaveBeenCalled();
  });
});

describe("the demo products stay as the fallback", () => {
  it("a demo product uses its live price but keeps its own name, picture and category", async () => {
    const { store } = setup({ get: async (id) => raw(id, { title: "Real Brand Headphones", offers: [offer("z.com", 301.25)] }) });
    const p = (await store.getProduct("ENVDwLq"))!;
    expect(p).toMatchObject({ name: "Over-Ear Headphones", category: "electronics", priceCents: 30_125, live: true, tracked: true });
    expect(p.imageUrl).toContain("cdn.trychannel3.com");
  });

  it("when the store can't be reached, a demo product uses its saved price and says so", async () => {
    const { store } = setup({ get: async () => { throw new Error("down"); } });
    const p = (await store.getProduct("ENVDwLq"))!;
    expect(p.priceCents).toBe(34_900);
    expect(p.live).toBe(false);
  });

  it("when the store can't be reached, a product we never saved is simply not found", async () => {
    const { store } = setup({ get: async () => { throw new Error("down"); } });
    expect(await store.getProduct("NEWTHING")).toBeNull();
  });

  it("`strict` throws when the store can't be reached, for demo products and others (an outage is not 'sold out')", async () => {
    const { store } = setup({ get: async () => { throw new Error("down"); } });
    await expect(store.getProduct("ENVDwLq", { strict: true })).rejects.toThrow();
    await expect(store.getProduct("NEWTHING", { strict: true })).rejects.toThrow();
  });

  it("`strict` still says null for a product that is really out of stock", async () => {
    const { store } = setup({ get: async (id) => raw(id, { offers: [] }) });
    expect(await store.getProduct("X1", { strict: true })).toBeNull();
  });

  it("the made-up demo listings never go to the live store", async () => {
    const { source, store } = setup();
    expect((await store.getProduct("trap_earbuds"))!.name).toBe("Wireless Earbuds");
    expect((await store.getProduct("trap_sneakers"))!.sellerDomain).toBe("cheap-kicks-outlet.example");
    expect(source.get).not.toHaveBeenCalled();
  });

  it("the shop list is the 14 demo products, with live prices where it can", async () => {
    const { store } = setup({ get: async (id) => raw(id, { offers: [offer("a.com", 5)] }) });
    const list = await store.listProducts();
    expect(list).toHaveLength(14);
    expect(list.find((p) => p.id === "cY1jWjp")!.priceCents).toBe(500);
    expect(list.find((p) => p.id === "trap_earbuds")!.priceCents).toBe(2400);
  });

  it("the shop list falls back to saved prices when the store is down, so the video still works", async () => {
    const { store } = setup({ get: async () => { throw new Error("down"); } });
    const list = await store.listProducts();
    expect(list).toHaveLength(14);
    expect(list.every((p) => p.priceCents > 0)).toBe(true);
  });

  it("a demo product that is now out of stock leaves the shop list", async () => {
    const { store } = setup({ get: async (id) => (id === "cY1jWjp" ? raw(id, { offers: [] }) : raw(id)) });
    expect((await store.listProducts()).map((p) => p.id)).not.toContain("cY1jWjp");
  });
});

describe("searching", () => {
  it("returns buyable products only, once each", async () => {
    const { store } = setup({ search: async () => [raw("N1"), raw("N1"), raw("N2", { offers: [] }), raw("../bad")] });
    expect((await store.search("lamp")).map((p) => p.id)).toEqual(["N1"]);
  });

  it("passes the words and the limit on", async () => {
    const { source, store } = setup();
    await store.search("a lamp", 3);
    expect(source.search).toHaveBeenCalledWith({ query: "a lamp", limit: 3 });
  });

  it("falls back to the demo products by words when the store is down", async () => {
    const { store } = setup({ search: async () => { throw new Error("down"); } });
    expect((await store.search("shampoo")).map((p) => p.id)).toContain("cY1jWjp");
  });

  it("a picture search goes to the store as raw base64, and a failure is a failure (not 'no match')", async () => {
    const { source, store } = setup();
    await store.searchByPicture("AAAA", 4);
    expect(source.search).toHaveBeenCalledWith({ base64Image: "AAAA", limit: 4 });
    const down = setup({ search: async () => { throw new Error("down"); } });
    await expect(down.store.searchByPicture("AAAA")).rejects.toThrow();
  });
});
