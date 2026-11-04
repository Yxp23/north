// The store layer. Everything else talks to this interface, never to the demo data directly,
// so a real store can replace the demo store later without touching the rest of the app.

export type StoreProduct = {
  /** Channel3 product id. */
  id: string;
  /** Plain display name, chosen by us (no brand names). */
  name: string;
  /** Matched against the user's essentials list by the Money Guardian. */
  category: string;
  /** Whole cents, taken from the Channel3 API value. Never from model text. */
  priceCents: number;
  currency: string;
  imageUrl: string;
  /** True when Channel3 price tracking was started, so a price history exists. */
  tracked: boolean;
};

export interface StoreProvider {
  listProducts(): Promise<StoreProduct[]>;
  getProduct(id: string): Promise<StoreProduct | null>;
  /** Simple word match on name and category. */
  search(query: string): Promise<StoreProduct[]>;
}
