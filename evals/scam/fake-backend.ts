// A fake store for the eval and its tests: it answers every search with the case's products.
import type { Candidate, DealBackend } from "../../src/lib/dealcheck/backend";
import type { HistoryFacts } from "../../src/lib/dealcheck/types";
import type { DealCase } from "./cases";

const cents = (d: number) => Math.round(d * 100);

export function fakeBackend(c: DealCase): DealBackend {
  const candidates: Candidate[] = c.products.map((p) => ({ id: p.id, title: p.title, offers: p.offers.map(([domain, dollars]) => ({ domain, cents: cents(dollars) })) }));
  return {
    searchText: async () => candidates,
    searchImage: async () => candidates,
    history: async (id): Promise<HistoryFacts | null> => {
      const h = c.products.find((p) => p.id === id)?.history;
      return h ? { minCents: cents(h.min), maxCents: cents(h.max), meanCents: cents(h.mean), status: "typical", points: h.points } : null;
    },
  };
}
