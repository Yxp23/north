import seed from "../../../data/demo-products.json";
import traps from "../../../data/demo-trap-listings.json";
import type { StoreProduct, StoreProvider } from "./types";

// Channel3 offers check out on each retailer's own site. So payments go to this sandbox
// demo store, stocked with real Channel3 products. No real order is placed anywhere.
// Rebuild the data with: node --env-file=.env.local scripts/seed-demo-store.mjs
// data/demo-trap-listings.json holds two made-up listings for the demo: a seller the scam checker can flag, and a
// listing with instructions hidden in its description (to show the Guardian blocks a tricked agent).
export class DemoStore implements StoreProvider {
  private readonly products: StoreProduct[];

  constructor(products: StoreProduct[] = [...seed.products, ...traps.products] as StoreProduct[]) {
    this.products = products;
  }

  async listProducts() {
    return [...this.products];
  }

  async getProduct(id: string) {
    return this.products.find((p) => p.id === id) ?? null;
  }

  async search(query: string) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return this.products.filter((p) => {
      const text = `${p.name} ${p.category}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }
}
