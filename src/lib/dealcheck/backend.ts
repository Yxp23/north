// Where the deal check gets store facts from. The real one is Channel3 (agents/scam-checker/run.ts);
// tests and the eval use a fake. Prices are whole cents from the API, offers are in-stock only.
import type { HistoryFacts, Offer } from "./types";

export type Candidate = {
  /** The store API's product id. The model never sees it: it gets a handle like "c1". */
  id: string;
  title: string;
  /** In-stock offers only. */
  offers: Offer[];
};

export interface DealBackend {
  searchText(query: string): Promise<Candidate[]>;
  searchImage(base64: string): Promise<Candidate[]>;
  /** Null when there is no history (not tracked yet, or no points). */
  history(productId: string): Promise<HistoryFacts | null>;
}
