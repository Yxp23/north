// Remembers a search for this browser tab, so Back, a tab switch or a refresh shows the SAME results without asking Channel3 again (each
// search costs a credit). The key is the typed words. Only product data the store already sent is kept; nothing secret, no photos.
// All of it is a convenience: when storage is blocked or full the page just searches again.
export type FindEntry = { at: number; answer: unknown; events: unknown[]; shown: number };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "north-find:";
const LAST = "north-find-last";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_CHARS = 400_000; // keep one entry small enough for the browser's storage

/** "Running  Shoes" and "running shoes" are the same search. */
export const normalizeQuery = (q: string): string => q.trim().replace(/\s+/g, " ").toLowerCase();

const session = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

export function readFind(q: string, now = Date.now(), store: Store | null = session()): FindEntry | null {
  try {
    const raw = store?.getItem(PREFIX + normalizeQuery(q));
    if (!raw) return null;
    const e = JSON.parse(raw) as FindEntry;
    if (typeof e?.at !== "number" || now - e.at > MAX_AGE_MS || !e.answer || !Array.isArray(e.events)) return null;
    return { ...e, shown: Number.isFinite(e.shown) && e.shown > 0 ? e.shown : 6 };
  } catch {
    return null;
  }
}

export function writeFind(q: string, entry: Omit<FindEntry, "at">, now = Date.now(), store: Store | null = session()): void {
  try {
    const raw = JSON.stringify({ ...entry, at: now });
    if (raw.length <= MAX_CHARS) store?.setItem(PREFIX + normalizeQuery(q), raw);
  } catch {
    /* storage is full or blocked: the search just runs again next time */
  }
}

/** Where the person was in the results when they opened a product, so "Back to results" returns to the same spot. */
export type LastResults = { url: string; scroll: number };

export function rememberResults(v: LastResults, store: Store | null = session()): void {
  try {
    store?.setItem(LAST, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function readLastResults(store: Store | null = session()): LastResults | null {
  try {
    const v = JSON.parse(store?.getItem(LAST) ?? "null") as LastResults | null;
    // Only ever a results page of ours: never an address someone else put there.
    return v && typeof v.url === "string" && v.url.startsWith("/find?q=") && Number.isFinite(v.scroll) ? { url: v.url, scroll: Math.max(0, v.scroll) } : null;
  } catch {
    return null;
  }
}

export const resultsUrl = (q: string): string => `/find?q=${encodeURIComponent(q.trim()).replace(/%20/g, "+")}`;
