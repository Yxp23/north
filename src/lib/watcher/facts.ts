// The Price Watcher's facts and words. Pure code, so it is tested without the network or a model.
// What the model gets to do: judge whether a change CODE found is worth telling the user, and phrase it.
// What it never does: invent a change, or put a price in the words. Every price comes from a store value, filled
// into the message by code.
import type { HistoryFacts } from "../dealcheck/types";
import type { PriceNotice, Watch } from "../ledger/types";
import { plainLine } from "../agents/plain-text";

/** What the store says right now (and the price history, when Channel3 tracks it). */
export type Reading = { available: boolean; priceCents: number | null; history: HistoryFacts | null };

export type Candidate = {
  kind: PriceNotice["kind"];
  priceCents?: number;
  dropCents?: number;
  dropPercent?: number;
  /** "kind:cents": the same news is never told twice. */
  key: string;
};

const MIN_DROP_CENTS = 100;
const MIN_DROP_PERCENT = 3;
/** "Normal" is within 5 percent of the usual price; "high" is more than 15 percent above it. */
const NORMAL_BAND = 1.05;
const HIGH_BAND = 1.15;

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Changes that might be worth telling the user. The model can only choose among these. */
export function candidatesFor(w: Watch, r: Reading): Candidate[] {
  const out: Candidate[] = [];
  const push = (c: Omit<Candidate, "key">) => {
    const key = `${c.kind}:${c.priceCents ?? 0}`;
    if (key !== w.lastNoticeKey) out.push({ ...c, key });
  };

  if (!r.available) {
    if (w.lastAvailable) push({ kind: "sold_out" });
    return out;
  }
  const now = r.priceCents;
  if (now === null) return out;

  if (!w.lastAvailable) push({ kind: "back_in_stock", priceCents: now });

  const drop = w.baselineCents - now;
  if (drop >= MIN_DROP_CENTS && (drop * 100) / w.baselineCents >= MIN_DROP_PERCENT) {
    push({ kind: "drop", priceCents: now, dropCents: drop, dropPercent: Math.round((drop * 100) / w.baselineCents) });
  }

  // Back to normal: it was high at the last check, and is near the usual price now.
  const usual = r.history?.meanCents;
  if (usual && w.lastCents !== undefined && w.lastCents > usual * HIGH_BAND && now <= usual * NORMAL_BAND) {
    push({ kind: "back_to_normal", priceCents: now });
  }
  return out;
}

/** Remember what the store said, whatever was decided about telling the user. */
export function applyReading(w: Watch, r: Reading, now: Date): void {
  w.lastAvailable = r.available;
  if (r.available && r.priceCents !== null) w.lastCents = r.priceCents;
  w.lastCheckedAt = now.toISOString();
}

/** Just what the words need from a watch. */
export type WatchNames = Pick<Watch, "name" | "baselineCents">;

const safeName = (name: string) => name.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

/** Code's own plain words for each kind of news. */
export function fallbackMessage(w: WatchNames, c: Candidate): string {
  const name = safeName(w.name);
  switch (c.kind) {
    case "drop": return `The ${name} you waited on is ${money(c.dropCents ?? 0)} cheaper now. Still want it?`;
    case "sold_out": return `The ${name} you waited on is sold out right now. I will tell you if it comes back.`;
    case "back_in_stock": return `The ${name} you waited on is back in stock at ${money(c.priceCents ?? 0)}. Still want it?`;
    case "back_to_normal": return `The ${name} is back to a normal price: ${money(c.priceCents ?? 0)}. Still want it?`;
  }
}

/**
 * The helper's message, with {name}, {price}, {drop} and {was} filled in by code from store values.
 * Only placeholders this kind of news has are allowed, the words around them may not hold any numbers, prices or
 * links, and the name must be in there. Anything else: code's own words.
 */
export function composeMessage(w: WatchNames, c: Candidate, template: string): string {
  const values: Record<string, string | undefined> = {
    name: safeName(w.name),
    price: c.priceCents !== undefined ? money(c.priceCents) : undefined,
    drop: c.dropCents !== undefined ? money(c.dropCents) : undefined,
    was: c.kind === "drop" || c.kind === "sold_out" ? money(w.baselineCents) : undefined,
  };
  const used = [...template.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]);
  if (!used.includes("name") || used.some((u) => values[u] === undefined)) return fallbackMessage(w, c);
  // The words around the placeholders must be plain: no digits, dollar signs, links or number words.
  const words = template.replace(/\{[a-z]+\}/g, " ");
  if (words.replace(/\s+/g, " ").trim() === "" || plainLine(words, 300, { noNumberWords: true }) === null || template.length > 200) return fallbackMessage(w, c);
  return template.replace(/\{([a-z]+)\}/g, (_, k: string) => values[k]!).replace(/\s+/g, " ").trim();
}
