// Does a product come in the size the user asked for? Code answers this from the store's own size list.
import type { ShelfItem } from "./types";

const WORDS: Record<string, string> = { "extra small": "xs", small: "s", medium: "m", large: "l", "extra large": "xl", "x large": "xl", "x small": "xs" };

export function normalizeSize(s: string): string {
  let t = s.toLowerCase().replace(/\b(?:size|us|uk|eu)\b/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(\d+)\.0+(?=\s|$)/, "$1"); // 8.0 -> 8
  return WORDS[t] ?? t;
}

/** "yes" it has that size, "no" it has sizes but not that one, "unknown" it has no size choice at all. */
export function sizeMatch(item: ShelfItem, wanted: string): "yes" | "no" | "unknown" {
  const want = normalizeSize(wanted);
  if (!want || !item.sizes?.length) return "unknown";
  return item.sizes.some((s) => normalizeSize(s) === want) ? "yes" : "no";
}
