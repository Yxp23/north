// Store comparison for a product screen: every in-stock store, cheapest first. Pure, so it is easy to test.
import type { StoreOffer } from "./types";

export type StoreRow = { domain: string; cents: number; /** The cheapest store: the one you pay. */ youPay: boolean; /** How much more than the cheapest. */ moreCents: number };
export type StoreComparison = {
  rows: StoreRow[];
  /** What you save by paying the cheapest store instead of the most expensive one. */
  saveCents: number;
  /** Stores not shown, when there are many. */
  hiddenCount?: number;
};

const SHOWN = 6;

export function compareStores(offers: StoreOffer[]): StoreComparison {
  const sorted = [...offers].sort((a, b) => a.cents - b.cents || a.domain.localeCompare(b.domain));
  if (sorted.length === 0) return { rows: [], saveCents: 0 };
  const lowest = sorted[0].cents;
  const rows = sorted.slice(0, SHOWN).map((o, i) => ({ domain: o.domain, cents: o.cents, youPay: i === 0, moreCents: o.cents - lowest }));
  return {
    rows,
    saveCents: sorted[sorted.length - 1].cents - lowest,
    ...(sorted.length > SHOWN ? { hiddenCount: sorted.length - SHOWN } : {}),
  };
}
