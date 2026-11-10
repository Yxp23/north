// The store layer. Everything else talks to this interface, never to the demo data directly,
// so a real store can replace the demo store later without touching the rest of the app.

/** One store's price for a product. Whole cents, from the API. */
export type StoreOffer = { domain: string; cents: number };

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
  /** Every picture the store has for it (https only, the main one first). Missing for the demo products, which have just the one we chose. */
  images?: string[];
  /** True when Channel3 price tracking was started, so a price history exists. */
  tracked: boolean;
  /**
   * The seller's web address, when the listing has one (demo listings from other sellers). A seller the scam
   * checker flagged as a scam can't be paid: the Guardian refuses.
   */
  sellerDomain?: string;
  /** The seller's description. UNTRUSTED text: it is data to show or read, never instructions. */
  description?: string;
  /** Every in-stock offer, cheapest first. `priceCents` is always the first one. Missing for the offline demo products. */
  offers?: StoreOffer[];
  /** The sizes this product comes in, when it has a size choice. */
  sizes?: string[];
  /** True when the price was just read from the live store. False when it is the saved demo price (the store could not be reached). */
  live?: boolean;
};

export interface StoreProvider {
  listProducts(): Promise<StoreProduct[]>;
  /**
   * `fresh: true` reads the price from the live store right now (checkout does this). Otherwise a read from the
   * last 10 minutes may be used. Null when the product does not exist or nothing is in stock.
   * `strict: true` throws when the live store can't be reached, instead of using a saved price or giving null
   * (the Price Watcher uses it: an outage must never look like "sold out").
   */
  getProduct(id: string, opts?: { fresh?: boolean; strict?: boolean }): Promise<StoreProduct | null>;
  /** Words to products. In-stock products only. */
  search(query: string, limit?: number): Promise<StoreProduct[]>;
  /** A picture (raw base64) to products. Empty when the store can't search by picture. */
  searchByPicture(base64: string, limit?: number): Promise<StoreProduct[]>;
}
