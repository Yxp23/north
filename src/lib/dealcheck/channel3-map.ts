// Channel3 answers -> the facts the deal check uses. Pure, so it is tested without the network.
// Prices become whole cents here, once, from the API's own numbers.
import type { Candidate } from "./backend";
import type { HistoryFacts, Offer } from "./types";

type RawOffer = { domain?: string; price?: { price?: number; currency?: string }; availability?: string };
export type RawProduct = { id: string; title?: string; offers?: RawOffer[] };
export type RawHistory = {
  history?: unknown[];
  statistics?: { min_price: number; max_price: number; mean: number; current_status: "low" | "typical" | "high" } | null;
} | null;

const IN_STOCK = /^in[_\s-]?stock$/i;

export function toCandidate(p: RawProduct): Candidate {
  const offers: Offer[] = [];
  for (const o of p.offers ?? []) {
    const price = o.price?.price;
    if (!o.domain || typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
    if (o.price?.currency !== "USD") continue;
    if (!IN_STOCK.test(o.availability ?? "")) continue;
    offers.push({ domain: o.domain.toLowerCase().replace(/^www\./, ""), cents: Math.round(price * 100) });
  }
  return { id: p.id, title: (p.title ?? "").slice(0, 120), offers };
}

export function toHistoryFacts(h: RawHistory | undefined): HistoryFacts | null {
  const s = h?.statistics;
  const points = Array.isArray(h?.history) ? h!.history!.length : 0;
  if (!s || points < 1) return null;
  const nums = [s.min_price, s.max_price, s.mean];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) return null;
  return {
    minCents: Math.round(s.min_price * 100),
    maxCents: Math.round(s.max_price * 100),
    meanCents: Math.round(s.mean * 100),
    status: s.current_status,
    points,
  };
}
