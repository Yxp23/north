// One price check for the user's waiting items. Called by the "Check prices now" button and by a schedule
// (Vercel cron, later). It only ever NOTIFIES: it writes price news into the ledger. It has no way to buy, and
// the notice only opens the product ("Still want it?"), where a buy still goes through the Money Guardian.
//   1. keep the watch list in step with the waiting list and buys,
//   2. read each item's live price and stock from the store (code),
//   3. work out which changes might be worth telling (code),
//   4. the Price Watcher agent judges and phrases them (the model; prices filled in by code),
//   5. save the news and what was seen.
import { runPriceWatcher, type WatchItem } from "../agents/watcher/watcher";
import type { ModelClient, StepEvent } from "../agents/loop";
import type { HistoryFacts } from "../dealcheck/types";
import type { Ledger } from "../ledger/ledger";
import { addAudit, summarize } from "../ledger/logic";
import type { PriceNotice, Watch } from "../ledger/types";
import { addNotice, syncWatches, watchedNow } from "./state";
import { applyReading, candidatesFor, type Candidate, type Reading } from "./facts";

export const MAX_PER_CHECK = 10;
const DAY_MS = 86_400_000;

export interface WatchBackend {
  /** The live price and stock, read now from the store. Throws when the store can't be reached. */
  read(productId: string): Promise<Reading>;
  history(productId: string): Promise<HistoryFacts | null>;
  /** Ask the store to start tracking this product's price (Channel3 price tracking). Best effort. */
  track?(productId: string): Promise<void>;
}

export type RunWatchDeps = {
  ledger: Ledger;
  backend: WatchBackend;
  client: ModelClient;
  now(): Date;
  newId(): string;
  onStep?(event: StepEvent): void;
  /** Demo only: pretend every price is this percent lower (labelled in the panel). */
  pretendDropPercent?: number;
};

export type WatchRunResult = { checked: number; notices: PriceNotice[]; error?: string };

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const plain = (s: string) => s.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export async function runWatchCheck(deps: RunWatchDeps): Promise<WatchRunResult> {
  const now = deps.now();
  const steps: StepEvent[] = [];
  const emit = (e: StepEvent) => {
    steps.push(e);
    deps.onStep?.(e);
  };

  // 1. The watch list, in step with the waiting list and buys.
  emit({ label: "Looking at what you are waiting on…", state: "working" });
  const { watches, leftCents } = await deps.ledger.update((d) => {
    syncWatches(d, now);
    const list = watchedNow(d).sort((a, b) => (a.lastCheckedAt ?? "").localeCompare(b.lastCheckedAt ?? "")).slice(0, MAX_PER_CHECK);
    return { watches: list.map((w) => ({ ...w })), leftCents: summarize(d, now).leftCents };
  });
  if (watches.length === 0) {
    emit({ label: "You are not waiting on anything yet.", state: "done" });
    emit({ label: "Done.", state: "done" });
    return { checked: 0, notices: [] };
  }
  emit({ label: "Looking at what you are waiting on…", state: "done", detail: `${watches.length} item${watches.length === 1 ? "" : "s"}.` });
  const pretend = deps.pretendDropPercent && deps.pretendDropPercent > 0 && deps.pretendDropPercent < 100 ? deps.pretendDropPercent : 0;
  if (pretend) emit({ label: `Pretend test: prices are pretended to be ${pretend}% lower.`, state: "done", warn: true });

  // 2. Read the live prices (code, not the model). Each is a step, so the user sees what was checked.
  type Seen = { watch: Watch; reading: Reading };
  const seen: Seen[] = [];
  for (const w of watches) {
    // The first time we see an item, ask Channel3 to start tracking its price, so a price history builds up.
    if (w.lastCheckedAt === undefined && deps.backend.track) {
      const trackLabel = `Asking Channel3 to track the price of ${plain(w.name)}…`;
      emit({ label: trackLabel, state: "working" });
      const ok = await deps.backend.track(w.productId).then(() => true, () => false);
      emit({ label: trackLabel, state: "done", detail: ok ? "Channel3 price tracking started. A history builds up over the next days." : "Channel3 could not start tracking this one. I will still check the price." });
    }
    const label = `Checking the price of ${plain(w.name)}…`;
    emit({ label, state: "working" });
    try {
      const real = await deps.backend.read(w.productId);
      const reading: Reading = pretend && real.available && real.priceCents !== null ? { ...real, priceCents: Math.round(real.priceCents * (1 - pretend / 100)) } : real;
      seen.push({ watch: w, reading });
      emit({ label, state: "done", detail: reading.available && reading.priceCents !== null ? `Store price now ${dollars(reading.priceCents)}${pretend ? " (pretend)" : ""}. When you started waiting: ${dollars(w.baselineCents)}.` : "Sold out right now." });
    } catch {
      emit({ label, state: "done", detail: "I could not reach the store for this one. I will try again later." });
    }
  } // one after another, so each check is one clean line in the panel

  // 3. What might be worth telling.
  const items: WatchItem[] = seen.map(({ watch: w, reading }, i) => ({
    handle: `w${i + 1}`, productId: w.productId, name: w.name, imageUrl: w.imageUrl,
    daysWaiting: Math.max(0, Math.floor((now.getTime() - new Date(w.startedAt).getTime()) / DAY_MS)),
    baselineCents: w.baselineCents, lastCents: w.lastCents, nowCents: reading.priceCents, available: reading.available,
    candidates: candidatesFor(w, reading),
  }));
  const candidatesBy = new Map<string, Candidate[]>(items.map((i) => [i.productId, i.candidates]));
  const historyByProduct = new Map(seen.map((s) => [s.watch.productId, s.reading.history]));

  // 4. The agent judges and phrases (only if code found something).
  const { outcome } = await runPriceWatcher({
    client: deps.client, items, leftCents,
    history: async (id) => historyByProduct.get(id) ?? deps.backend.history(id),
    onStep: emit,
  });
  if (outcome.kind === "error") {
    // Nothing is marked as seen, so the news is not lost: the next check finds it again.
    emit({ label: "I could not finish. I will try again later.", state: "done", warn: true });
    emit({ label: "Done.", state: "done" });
    return { checked: seen.length, notices: [], error: outcome.message };
  }

  // 5. Save what was seen, and the news.
  const created: PriceNotice[] = [];
  await deps.ledger.update((d) => {
    created.length = 0;
    for (const { watch: s, reading } of seen) {
      const w = d.priceWatch.watches.find((x) => x.productId === s.productId && x.active);
      if (!w) continue; // it was bought or stopped while we were looking
      if (!pretend) applyReading(w, reading, now); // a pretend price is never remembered as the real last price
      const told = outcome.notices.find((n) => n.productId === s.productId);
      // Whatever was judged is not asked again at this price.
      const key = told?.candidate.key ?? candidatesBy.get(s.productId)?.[0]?.key;
      if (key) w.lastNoticeKey = key;
      if (told) {
        addNotice(d, { id: deps.newId(), productId: w.productId, name: w.name, imageUrl: w.imageUrl, kind: told.candidate.kind, message: told.message, priceCents: told.candidate.priceCents }, now);
        created.push(d.priceWatch.notices[d.priceWatch.notices.length - 1]);
      }
    }
    addAudit(d, "price_watch", `Checked ${seen.length} item${seen.length === 1 ? "" : "s"}. Told the user about ${created.length}.`, now);
  });
  emit({ label: "Done.", state: "done" });
  return { checked: seen.length, notices: created };
}
