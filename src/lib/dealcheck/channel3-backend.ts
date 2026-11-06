// The real store facts for the deal check: Channel3 search, image search and price history.
// Server only. Prices come from Channel3's own numbers (see channel3-map.ts).
import "server-only";
import { getHistory, search } from "../channel3";
import type { Candidate, DealBackend } from "./backend";
import { toCandidate, toHistoryFacts, type RawProduct } from "./channel3-map";

const asCandidates = (products: RawProduct[]): Candidate[] => products.map(toCandidate);

export const channel3Backend: DealBackend = {
  async searchText(query) {
    return asCandidates((await search({ query, limit: 5 })).products as RawProduct[]);
  },
  async searchImage(base64) {
    return asCandidates((await search({ base64Image: base64, limit: 5 })).products as RawProduct[]);
  },
  async history(productId) {
    try {
      return toHistoryFacts(await getHistory(productId, 30));
    } catch {
      return null; // not tracked, or the service is down: no history, and the verdict says so
    }
  },
};
