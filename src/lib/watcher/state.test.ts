import { describe, expect, it } from "vitest";
import { defaultLedgerData } from "../ledger/logic";
import type { LedgerData, PurchaseRecord, WaitingItem } from "../ledger/types";
import { addNotice, dismissNotice, MAX_NOTICES, MAX_WATCHES, startWatch, stopWatch, syncWatches, watchedNow } from "./state";

const NOW = new Date("2026-11-07T15:00:00Z");
const fresh = (): LedgerData => defaultLedgerData(NOW, "America/New_York");
const product = (id: string, priceCents = 34_900) => ({ id, name: `Thing ${id}`, imageUrl: "https://i/x.jpg", priceCents });
const waiting = (id: string, over: Partial<WaitingItem> = {}): WaitingItem => ({
  id: `wait_${id}`, productId: id, name: `Thing ${id}`, category: "c", imageUrl: "https://i/x.jpg", amountCents: 34_900, currency: "USD",
  createdAt: "2026-11-06T10:00:00.000Z", remindAt: "2026-11-07T10:00:00.000Z", waitHours: 24, rules: ["late_night"], status: "waiting", ...over,
});
const purchase = (productId: string, over: Partial<PurchaseRecord> = {}): PurchaseRecord => ({
  id: `pur_${productId}`, attemptId: `a_${productId}`, productId, name: "n", category: "c", imageUrl: "https://i/x.jpg", amountCents: 100, currency: "USD",
  status: "paid", createdAt: "2026-11-07T12:00:00.000Z", overrodeWait: false, decisionCode: "ok", ...over,
});

describe("starting and stopping a watch the user chose", () => {
  it("watches an item from the price it has now", () => {
    const d = fresh();
    expect(startWatch(d, product("A", 34_900), NOW)).toBe("started");
    expect(d.priceWatch.watches).toEqual([{ productId: "A", name: "Thing A", imageUrl: "https://i/x.jpg", source: "chosen", startedAt: NOW.toISOString(), baselineCents: 34_900, lastCents: 34_900, lastAvailable: true, active: true }]);
  });
  it("watching the same thing twice does nothing the second time", () => {
    const d = fresh();
    startWatch(d, product("A"), NOW);
    expect(startWatch(d, product("A", 100), NOW)).toBe("already");
    expect(d.priceWatch.watches).toHaveLength(1);
    expect(d.priceWatch.watches[0].baselineCents).toBe(34_900);
  });
  it("stopping then watching again starts fresh from the new price", () => {
    const d = fresh();
    startWatch(d, product("A", 34_900), NOW);
    stopWatch(d, "A");
    expect(watchedNow(d)).toEqual([]);
    expect(startWatch(d, product("A", 30_000), NOW)).toBe("started");
    expect(d.priceWatch.watches).toHaveLength(1);
    expect(d.priceWatch.watches[0]).toMatchObject({ active: true, baselineCents: 30_000, lastCents: 30_000 });
  });
  it("won't watch more than a few things at once", () => {
    const d = fresh();
    for (let i = 0; i < MAX_WATCHES; i++) expect(startWatch(d, product(`P${i}`), NOW)).toBe("started");
    expect(startWatch(d, product("ONE_MORE"), NOW)).toBe("full");
  });
});

describe("keeping the watch list in step with the waiting list and buys", () => {
  it("every item on the waiting list is watched, from the price it was saved at", () => {
    const d = fresh();
    d.waitingList.push(waiting("H", { amountCents: 34_900 }));
    syncWatches(d, NOW);
    expect(d.priceWatch.watches).toEqual([{ productId: "H", name: "Thing H", imageUrl: "https://i/x.jpg", source: "waiting_list", startedAt: "2026-11-06T10:00:00.000Z", baselineCents: 34_900, lastCents: 34_900, lastAvailable: true, active: true }]);
  });
  it("syncing again changes nothing", () => {
    const d = fresh();
    d.waitingList.push(waiting("H"));
    syncWatches(d, NOW);
    const once = JSON.stringify(d.priceWatch);
    syncWatches(d, NOW);
    expect(JSON.stringify(d.priceWatch)).toBe(once);
  });
  it("an item the user chose to watch that is also on the waiting list is one watch, and keeps its own baseline", () => {
    const d = fresh();
    startWatch(d, product("H", 40_000), NOW);
    d.waitingList.push(waiting("H", { amountCents: 34_900 }));
    syncWatches(d, NOW);
    expect(d.priceWatch.watches).toHaveLength(1);
    expect(d.priceWatch.watches[0].baselineCents).toBe(40_000);
  });
  it("a waiting-list watch ends when the item leaves the waiting list", () => {
    const d = fresh();
    d.waitingList.push(waiting("H"));
    syncWatches(d, NOW);
    d.waitingList[0].status = "dropped";
    syncWatches(d, NOW);
    expect(watchedNow(d)).toEqual([]);
  });
  it("a chosen watch stays when the item is not on the waiting list", () => {
    const d = fresh();
    startWatch(d, product("A"), NOW);
    syncWatches(d, NOW);
    expect(watchedNow(d).map((w) => w.productId)).toEqual(["A"]);
  });
  it("buying the thing ends the watch (a buy after the watch began)", () => {
    const d = fresh();
    startWatch(d, product("A"), new Date("2026-11-07T10:00:00Z"));
    d.purchases.push(purchase("A", { createdAt: "2026-11-07T12:00:00.000Z" }));
    syncWatches(d, NOW);
    expect(watchedNow(d)).toEqual([]);
  });
  it("an old buy from before the watch began does not end it", () => {
    const d = fresh();
    d.purchases.push(purchase("A", { createdAt: "2026-11-01T12:00:00.000Z" }));
    startWatch(d, product("A"), NOW);
    syncWatches(d, NOW);
    expect(watchedNow(d)).toHaveLength(1);
  });
  it("a failed or refunded buy does not end it, but a paid or pending one does", () => {
    const d = fresh();
    startWatch(d, product("F"), new Date("2026-11-07T10:00:00Z"));
    startWatch(d, product("R"), new Date("2026-11-07T10:00:00Z"));
    startWatch(d, product("P"), new Date("2026-11-07T10:00:00Z"));
    d.purchases.push(purchase("F", { status: "failed" }), purchase("R", { status: "refunded" }), purchase("P", { status: "pending" }));
    syncWatches(d, NOW);
    expect(watchedNow(d).map((w) => w.productId).sort()).toEqual(["F", "R"]);
  });
});

describe("price news", () => {
  const n = (over = {}) => ({ id: "n1", productId: "A", name: "Thing A", imageUrl: "https://i/x.jpg", kind: "drop" as const, message: "Cheaper now.", priceCents: 100, ...over });
  it("adds news, newest kept, not dismissed", () => {
    const d = fresh();
    addNotice(d, n(), NOW);
    expect(d.priceWatch.notices).toEqual([{ ...n(), createdAt: NOW.toISOString(), dismissed: false }]);
  });
  it("dismissing hides it, and a second dismiss is harmless", () => {
    const d = fresh();
    addNotice(d, n(), NOW);
    expect(dismissNotice(d, "n1")).toBe(true);
    expect(dismissNotice(d, "n1")).toBe(true);
    expect(dismissNotice(d, "nope")).toBe(false);
    expect(d.priceWatch.notices[0].dismissed).toBe(true);
  });
  it("keeps only the newest few; dismissed news goes first", () => {
    const d = fresh();
    for (let i = 0; i < MAX_NOTICES + 5; i++) addNotice(d, n({ id: `n${i}` }), new Date(NOW.getTime() + i * 1000));
    expect(d.priceWatch.notices).toHaveLength(MAX_NOTICES);
    expect(d.priceWatch.notices.some((x) => x.id === "n0")).toBe(false);
    expect(d.priceWatch.notices.some((x) => x.id === `n${MAX_NOTICES + 4}`)).toBe(true);
  });
});
