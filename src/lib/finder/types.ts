// What the Finder and "Help me choose" know about a product. Plain facts from the store, nothing from a model.
// (agents/ can't import the store, so this is the small shape they share. finder/adapter.ts fills it from the store.)
export type ShelfItem = {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  /** The lowest in-stock price, whole cents, from the store. */
  priceCents: number;
  /** The store with that price. */
  domain: string;
  storeCount: number;
  /** The sizes it comes in, when it has a size choice. */
  sizes?: string[];
};

export interface FindBackend {
  search(query: string, limit: number): Promise<ShelfItem[]>;
  /** A picture (raw base64) to products. Throws when the picture search fails. */
  searchByPicture(base64: string, limit: number): Promise<ShelfItem[]>;
}
