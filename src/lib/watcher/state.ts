// What the Price Watcher keeps: the items it watches and the price news it wrote. Pure code on the ledger data.
// Nothing here can approve or start a buy: it only keeps lists.
import type { LedgerData, PriceNotice, Watch } from "../ledger/types";

export const MAX_WATCHES = 20;
export const MAX_NOTICES = 30;

type WatchProduct = { id: string; name: string; imageUrl: string; priceCents: number };

/** Start watching something the user chose to wait on. The price now is the price to beat. */
export function startWatch(data: LedgerData, p: WatchProduct, now: Date): "started" | "already" | "full" {
  const existing = data.priceWatch.watches.find((w) => w.productId === p.id);
  if (existing?.active) return "already";
  if (!existing && data.priceWatch.watches.filter((w) => w.active).length >= MAX_WATCHES) return "full";
  const fresh: Watch = { productId: p.id, name: p.name, imageUrl: p.imageUrl, source: "chosen", startedAt: now.toISOString(), baselineCents: p.priceCents, lastCents: p.priceCents, lastAvailable: true, active: true };
  if (existing) Object.assign(existing, fresh, { lastCheckedAt: undefined, lastNoticeKey: undefined });
  else data.priceWatch.watches.push(fresh);
  return "started";
}

export function stopWatch(data: LedgerData, productId: string): void {
  for (const w of data.priceWatch.watches) if (w.productId === productId) w.active = false;
}

export const watchedNow = (data: LedgerData): Watch[] => data.priceWatch.watches.filter((w) => w.active);

/** Keep the watches in step with the waiting list and with buys. Safe to run again and again. */
export function syncWatches(data: LedgerData, now: Date): void {
  const stillWaiting = new Set(data.waitingList.filter((w) => w.status === "waiting").map((w) => w.productId));

  // Everything on the waiting list is watched, from the price it was saved at.
  for (const item of data.waitingList) {
    if (item.status !== "waiting") continue;
    const w = data.priceWatch.watches.find((x) => x.productId === item.productId);
    if (!w) {
      if (data.priceWatch.watches.filter((x) => x.active).length >= MAX_WATCHES) continue;
      data.priceWatch.watches.push({
        productId: item.productId, name: item.name, imageUrl: item.imageUrl, source: "waiting_list", startedAt: item.createdAt,
        baselineCents: item.amountCents, lastCents: item.amountCents, lastAvailable: true, active: true,
      });
    } else if (!w.active) {
      Object.assign(w, { source: "waiting_list", startedAt: now.toISOString(), baselineCents: item.amountCents, lastCents: item.amountCents, lastAvailable: true, active: true, lastCheckedAt: undefined, lastNoticeKey: undefined });
    }
  }

  for (const w of data.priceWatch.watches) {
    if (!w.active) continue;
    // A watch that only existed because of the waiting list ends when the item leaves it.
    if (w.source === "waiting_list" && !stillWaiting.has(w.productId)) w.active = false;
    // Bought (paid, or being paid) after the watch began: done.
    if (data.purchases.some((p) => p.productId === w.productId && (p.status === "paid" || p.status === "pending") && p.createdAt >= w.startedAt)) w.active = false;
  }
}

export function addNotice(data: LedgerData, n: Omit<PriceNotice, "createdAt" | "dismissed">, now: Date): void {
  data.priceWatch.notices.push({ ...n, createdAt: now.toISOString(), dismissed: false });
  // Keep it short. Dismissed news goes first, then the oldest.
  while (data.priceWatch.notices.length > MAX_NOTICES) {
    const dismissed = data.priceWatch.notices.findIndex((x) => x.dismissed);
    data.priceWatch.notices.splice(dismissed >= 0 ? dismissed : 0, 1);
  }
}

export function dismissNotice(data: LedgerData, id: string): boolean {
  const n = data.priceWatch.notices.find((x) => x.id === id);
  if (!n) return false;
  n.dismissed = true;
  return true;
}
