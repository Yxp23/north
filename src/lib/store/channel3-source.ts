// The real StoreSource: Channel3. Server only.
import "server-only";
import { Channel3Error, getProduct, search } from "../channel3";
import type { StoreSource } from "./live-store";
import type { RawStoreProduct } from "./map";

export const channel3Source: StoreSource = {
  async search(q) {
    return (await search({ query: q.query, base64Image: q.base64Image, limit: q.limit })).products as RawStoreProduct[];
  },
  async get(id, { fresh }) {
    try {
      return (await getProduct(id, { fresh })) as RawStoreProduct;
    } catch (e) {
      if (e instanceof Channel3Error && (e.status === 404 || e.status === 422)) return null; // no such product
      throw e;
    }
  },
};
