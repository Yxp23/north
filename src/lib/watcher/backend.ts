// The real store facts for the Price Watcher: the live price and stock, and Channel3 price tracking. Server only.
import "server-only";
import { getHistory, startTracking } from "../channel3";
import { toHistoryFacts } from "../dealcheck/channel3-map";
import type { StoreProvider } from "../store";
import type { WatchBackend } from "./run";

export const storeWatchBackend = (store: StoreProvider): WatchBackend => ({
  async read(productId) {
    // strict: if the store can't be reached this THROWS, so an outage is never reported as "sold out".
    // A saved (offline) price is never used either.
    const p = await store.getProduct(productId, { fresh: true, strict: true });
    if (p && p.live === false) throw new Error("not live");
    const history = process.env.CHANNEL3_API_KEY && p ? await getHistory(productId, 30).then(toHistoryFacts, () => null) : null;
    return { available: p !== null, priceCents: p?.priceCents ?? null, history };
  },
  async history(productId) {
    return process.env.CHANNEL3_API_KEY ? getHistory(productId, 30).then(toHistoryFacts, () => null) : null;
  },
  async track(productId) {
    if (process.env.CHANNEL3_API_KEY) await startTracking(productId);
  },
});
