// The dynamic demo store. Any Channel3 product can be bought at its live price: the lowest in-stock offer, read
// from Channel3 (never from model text). Channel3 offers check out on each retailer's own site, so payments go to
// our sandbox demo store; no real order is placed anywhere. Say so in the README and the video.
//
// The 14 seeded products stay as the fallback: if Channel3 can't be reached, they keep working at their saved price.
import { DemoStore } from "./demo-store";
import { toStoreProduct, type RawStoreProduct } from "./map";
import type { StoreProduct, StoreProvider } from "./types";

/** Where raw products come from. The real one is Channel3 (store/channel3-source.ts). Tests use a fake. */
export interface StoreSource {
  search(q: { query?: string; base64Image?: string; limit: number }): Promise<RawStoreProduct[]>;
  /** Null when the store has no such product. Throws when the store can't be reached. */
  get(id: string, opts: { fresh: boolean }): Promise<RawStoreProduct | null>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** Made-up demo listings. They only exist here, so they are never looked up live. */
const isLocalOnly = (id: string) => id.startsWith("trap_");

export class LiveStore implements StoreProvider {
  constructor(private readonly source: StoreSource, private readonly demo: DemoStore = new DemoStore()) {}

  async getProduct(id: string, opts: { fresh?: boolean } = {}): Promise<StoreProduct | null> {
    if (!SAFE_ID.test(id)) return null;
    const saved = await this.demo.getProduct(id);
    if (isLocalOnly(id)) return saved;
    try {
      const raw = await this.source.get(id, { fresh: opts.fresh === true });
      const live = raw ? toStoreProduct(raw) : null;
      return live ? overlay(live, saved) : null; // not found, or nothing in stock: it can't be bought
    } catch {
      return saved ? { ...saved, live: false } : null; // the store is down: a demo product keeps its saved price
    }
  }

  async listProducts(): Promise<StoreProduct[]> {
    const saved = await this.demo.listProducts();
    const list = await Promise.all(saved.map((p) => (isLocalOnly(p.id) ? p : this.getProduct(p.id))));
    return list.filter((p): p is StoreProduct => p !== null);
  }

  async search(query: string, limit = 5): Promise<StoreProduct[]> {
    try {
      return await this.fromRaw(await this.source.search({ query, limit }), limit);
    } catch {
      return (await this.demo.search(query)).slice(0, limit); // the store is down: look in the demo products
    }
  }

  /** A failure here is a failure, not "no match": the caller says so. */
  async searchByPicture(base64: string, limit = 5): Promise<StoreProduct[]> {
    return this.fromRaw(await this.source.search({ base64Image: base64, limit }), limit);
  }

  private async fromRaw(raws: RawStoreProduct[], limit: number): Promise<StoreProduct[]> {
    const seen = new Set<string>();
    const out: StoreProduct[] = [];
    for (const r of raws) {
      const p = toStoreProduct(r);
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(overlay(p, await this.demo.getProduct(p.id)));
      if (out.length >= limit) break;
    }
    return out;
  }
}

/** A demo product keeps the name, picture and category we chose (brand-free, checked by eye); the price is live. */
function overlay(live: StoreProduct, saved: StoreProduct | null): StoreProduct {
  if (!saved) return live;
  return { ...live, name: saved.name, category: saved.category, imageUrl: saved.imageUrl, tracked: saved.tracked };
}
