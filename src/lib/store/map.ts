// Channel3 answers -> store products. Pure, so it is tested without the network.
// Prices are whole cents from the API's own numbers; the lowest in-stock offer is THE price.
import { toCandidate } from "../dealcheck/channel3-map";
import type { StoreOffer, StoreProduct } from "./types";

export type RawStoreProduct = {
  id: string;
  title?: string;
  description?: string;
  brands?: ({ name?: string } | string)[];
  images?: { url?: string; is_main_image?: boolean }[];
  offers?: { domain?: string; price?: { price?: number; currency?: string }; availability?: string }[];
  category?: { title?: string; path?: { title?: string }[] };
  age?: string | null;
  variants?: { options?: { name?: string; values?: { label?: string; exists?: boolean; available?: string | null }[] }[] } | null;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** A product under this can be a "must-have". See ourCategory. */
const ESSENTIAL_MAX_CENTS = 5000;
const ESSENTIAL_CATEGORIES = new Set(["groceries", "household", "personal care", "medicine"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** No real brand names on screen (the contest bans them). Takes the brands Channel3 lists for the product out of its name. */
export function stripBrands(title: string, brands: ({ name?: string } | string)[] = []): string {
  let t = title;
  for (const b of brands) {
    const name = (typeof b === "string" ? b : b?.name ?? "").trim();
    if (name.length < 3) continue; // a one-letter "brand" would eat ordinary words
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?:['\u2019]s)?(?![\\p{L}\\p{N}])`, "giu"), " ");
  }
  return t
    .replace(/\s+/g, " ")
    .replace(/([:|,])\s*[-\u2013\u2014]\s+/g, "$1 ") // "Sale: - Kettle" -> "Sale: Kettle"
    .replace(/^\s*(?:by|from)\s+/i, "")
    .replace(/\s+(?:by|from|for)\s*$/i, "")
    .replace(/^[\s\-\u2013\u2014|:,]+|[\s\-\u2013\u2014|:,]+$/g, "")
    .trim();
}

/**
 * Our short category word, from Channel3's category path. The Money Guardian matches it against the user's
 * must-have list. Anything unclear becomes the plain category name, which is NOT a must-have, so a mistake here can
 * only make the Guardian stricter. (toStoreProduct also refuses must-have for anything over $50.)
 */
export function ourCategory(path: string[]): string {
  const titles = path.map((t) => t.toLowerCase());
  const all = titles.join(" > ");
  const leaf = (titles[titles.length - 1] ?? "other").slice(0, 40);
  if (!all) return "other";
  // (below the top level: the top level is called "Food, Beverages & Tobacco")
  if (/tobacco|alcohol|beer|wine|liquor|spirits|cigar|vape/.test(titles.slice(1).join(" > "))) return leaf;
  if (/medicine|medication|pharmac|drugs|first aid/.test(all)) return "medicine";
  if (/food|beverage|grocer/.test(titles[0] ?? "")) return "groceries";
  if (/household supplies|household cleaning|cleaning supplies|laundry|paper products|toilet paper|trash bags/.test(all)) return "household";
  if (/personal care/.test(all) && !/cosmetic|makeup|fragrance|perfume|nail/.test(all)) return "personal care";
  if (/\bshoes\b/.test(all)) return "shoes";
  if (/clothing/.test(all)) return "clothes";
  if (/electronics/.test(all)) return "electronics";
  return leaf;
}

/**
 * The Size choice Channel3 lists for a product (variants.options named "Size"): the labels as the store writes them, split into sizes that are in
 * stock (or unknown, as search results do not say) and sizes the store says are OutOfStock. There is no price per size: Channel3 prices are per store.
 * A product with no Size option has none, and we never make sizes up.
 */
export function sizeChoices(raw: RawStoreProduct): { sizes: string[]; soldOut: string[] } {
  const opt = raw.variants?.options?.find((o) => /^size$/i.test(o.name ?? ""));
  const sizes: string[] = [];
  const soldOut: string[] = [];
  for (const v of opt?.values ?? []) {
    if (v.exists === false || typeof v.label !== "string") continue;
    const label = v.label.trim().slice(0, 12);
    if (!label || sizes.includes(label) || soldOut.includes(label)) continue;
    (v.available === "OutOfStock" ? soldOut : sizes).push(label);
  }
  return { sizes, soldOut };
}

/** The sizes this product comes in, if it has a size choice at all. */
export function sizesOf(raw: RawStoreProduct): string[] | undefined {
  const { sizes } = sizeChoices(raw);
  return sizes.length ? sizes : undefined;
}

/** Null when it can't be bought: nothing in stock, no picture, or an odd id. */
export function toStoreProduct(raw: RawStoreProduct): StoreProduct | null {
  if (!raw || typeof raw.id !== "string" || !SAFE_ID.test(raw.id)) return null;
  const offers: StoreOffer[] = toCandidate({ id: raw.id, title: raw.title, offers: raw.offers }).offers
    .map((o) => ({ domain: o.domain, cents: o.cents }))
    .sort((a, b) => a.cents - b.cents || a.domain.localeCompare(b.domain));
  if (offers.length === 0) return null;

  const image = raw.images?.find((i) => i.is_main_image && i.url) ?? raw.images?.find((i) => i.url);
  if (!image?.url || !/^https:\/\//.test(image.url)) return null;

  // Every https picture, the main one first, no repeats (a product page shows them all).
  const images = [image.url, ...(raw.images ?? []).map((i) => i.url ?? "")].filter((u, i, all) => /^https:\/\//.test(u) && all.indexOf(u) === i).slice(0, 12);

  const path = (raw.category?.path ?? []).map((p) => p.title ?? "").filter(Boolean);
  if (path.length === 0 && raw.category?.title) path.push(raw.category.title);
  const name = (stripBrands((raw.title ?? "").slice(0, 160), raw.brands) || raw.category?.title || "Product").slice(0, 80);

  let category = ourCategory(path);
  // A wrong label must never loosen the rules: only cheap things can be must-haves.
  if (ESSENTIAL_CATEGORIES.has(category) && offers[0].cents > ESSENTIAL_MAX_CENTS) category = (path[path.length - 1] ?? "other").toLowerCase().slice(0, 40);

  const { sizes, soldOut } = sizeChoices(raw);
  return {
    id: raw.id,
    name,
    category,
    priceCents: offers[0].cents,
    currency: "USD",
    imageUrl: image.url,
    ...(images.length > 1 ? { images } : {}),
    tracked: false,
    sellerDomain: offers[0].domain,
    ...(typeof raw.description === "string" && raw.description ? { description: raw.description.slice(0, 1500) } : {}),
    offers,
    ...(sizes.length ? { sizes } : {}),
    ...(soldOut.length ? { soldOutSizes: soldOut } : {}),
    ...(raw.age === "kids" ? { kidsListing: true } : {}),
    live: true,
  };
}
