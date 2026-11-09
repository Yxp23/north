// Video-safe mode: for recording the demo. Real prices and real comparisons stay; store names become "Store A, B, C", product names become
// generic ("Electronics item A"), and the photos are blurred. Pure helpers: the same store always gets the same letter within one recording.
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const label = (n: number) => (n < 26 ? LETTERS[n] : `${LETTERS[Math.floor(n / 26) - 1]}${LETTERS[n % 26]}`);

// Store addresses in running text: a name, dots, and a common ending. (Narrow on purpose, so "e.g." and file names are left alone.)
const DOMAIN = /\b(?:[a-z0-9][a-z0-9-]*\.)+(?:com|net|org|co|io|shop|store|app|us|uk|de|ca|au|info|biz|xyz|online|site)\b/gi;

export type Masker = {
  store(domain: string): string;
  item(name: string, category?: string): string;
  /** Replaces every store address in a sentence. */
  text(s: string): string;
  reset(): void;
};

export function createMasker(): Masker {
  const stores = new Map<string, string>();
  const items = new Map<string, string>();
  const store = (domain: string) => {
    const key = domain.trim().toLowerCase().replace(/^www\./, "");
    if (!stores.has(key)) stores.set(key, `Store ${label(stores.size)}`);
    return stores.get(key)!;
  };
  return {
    store,
    item(name, category) {
      const key = name.trim().toLowerCase();
      if (!items.has(key)) {
        const kind = category && /^[a-z ]{2,24}$/i.test(category) ? `${category.charAt(0).toUpperCase()}${category.slice(1)} item` : "Item";
        items.set(key, `${kind} ${label(items.size)}`);
      }
      return items.get(key)!;
    },
    text: (s) => s.replace(DOMAIN, (d) => store(d)),
    reset() {
      stores.clear();
      items.clear();
    },
  };
}
