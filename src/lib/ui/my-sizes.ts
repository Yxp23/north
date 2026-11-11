// "My sizes": the shoe and clothing size a person chose before, so the next product can be preselected ("Your usual size: 9"). It is only a
// convenience for choosing: it lives in this browser (localStorage), is never sent anywhere by itself, and can't buy, approve or change a rule.
// The size that is bought is the one picked on the product, checked by the server against the store's own list.
export type SizeKind = "shoes" | "clothes" | "rings";
export type MySizes = Partial<Record<"shoes" | "clothes", string>>;

const KEY = "north-my-sizes";
const OK = /^[A-Za-z0-9][A-Za-z0-9 ./-]{0,11}$/;

/** Which kind of size is it? Only shoes, clothes and rings have one we recognise; anything else has none (we never guess). */
export function sizeKindOf(p: { category?: string; name?: string }): SizeKind | null {
  const c = (p.category ?? "").toLowerCase();
  if (c === "shoes") return "shoes";
  if (c === "clothes") return "clothes";
  if (/\bring(s)?\b/.test(c) || /\bring\b/i.test(p.name ?? "")) return "rings";
  return null;
}

/** The saved sizes, read defensively (nothing odd gets through). */
export function parseMySizes(raw: string | null | undefined): MySizes {
  try {
    const j = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    const out: MySizes = {};
    if (j && typeof j.shoes === "string" && OK.test(j.shoes)) out.shoes = j.shoes;
    if (j && typeof j.clothes === "string" && OK.test(j.clothes)) out.clothes = j.clothes;
    return out;
  } catch {
    return {};
  }
}

/** Your usual size for this product, only if the product really has it. */
export function usualSizeFor(saved: MySizes, kind: SizeKind | null, available: string[] | undefined): string | null {
  if (!kind || kind === "rings" || !available?.length) return null;
  const s = saved[kind];
  return s && available.includes(s) ? s : null;
}

/** Should we offer to remember a size the person just picked? Only for shoes and clothes, and only if it is new. */
export const shouldOfferToRemember = (saved: MySizes, kind: SizeKind | null, picked: string | null): kind is "shoes" | "clothes" =>
  (kind === "shoes" || kind === "clothes") && !!picked && saved[kind] !== picked;

// A tiny external store, so every part of the page (the product, Money) stays in step.
const listeners = new Set<() => void>();
let rawCache: string | null | undefined;
let parsed: MySizes = {};
const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export function mySizesSnapshot(): MySizes {
  const raw = read();
  if (raw !== rawCache) {
    rawCache = raw;
    parsed = parseMySizes(raw);
  }
  return parsed;
}
const SERVER: MySizes = {};
export const mySizesServerSnapshot = () => SERVER;
export function subscribeMySizes(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function write(next: MySizes) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* blocked storage: the size just isn't remembered */
  }
  rawCache = undefined;
  listeners.forEach((l) => l());
}
export function rememberSize(kind: "shoes" | "clothes", size: string) {
  if (OK.test(size)) write({ ...mySizesSnapshot(), [kind]: size });
}
export function forgetSize(kind: "shoes" | "clothes") {
  const next = { ...mySizesSnapshot() };
  delete next[kind];
  write(next);
}
