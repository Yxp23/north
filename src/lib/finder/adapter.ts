// Fills the Finder's small shapes from the store layer. The agents never see the store itself.
import type { StoreProduct, StoreProvider } from "../store";
import { pricesVary } from "../store/spread";
import type { FindBackend, ShelfItem } from "./types";

export function shelfItemOf(p: StoreProduct): ShelfItem {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    imageUrl: p.imageUrl,
    priceCents: p.priceCents,
    domain: p.offers?.[0]?.domain ?? p.sellerDomain ?? "the demo shop",
    storeCount: p.offers?.length ?? 1,
    ...(p.offers && pricesVary(p.offers) ? { priceVaries: true } : {}),
    ...(p.sizes?.length ? { sizes: p.sizes } : {}),
  };
}

export const storeFindBackend = (store: StoreProvider): FindBackend => ({
  search: async (query, limit) => (await store.search(query, limit)).map(shelfItemOf),
  searchByPicture: async (base64, limit) => (await store.searchByPicture(base64, limit)).map(shelfItemOf),
});
