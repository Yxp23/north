import { describe, expect, it } from "vitest";
import { defaultLedgerData, dropWaiting, restoreWaiting, summarize } from "./logic";
import type { WaitingItem } from "./types";

const NOW = new Date("2026-11-04T15:00:00Z");
const item = (over: Partial<WaitingItem> = {}): WaitingItem => ({
  id: "wait_1", productId: "p1", name: "Headphones", category: "electronics", imageUrl: "x", amountCents: 8900, currency: "USD",
  createdAt: NOW.toISOString(), remindAt: new Date(NOW.getTime() + 24 * 3_600_000).toISOString(), waitHours: 24, rules: ["big_buy"], status: "waiting", ...over,
});

describe("removing a saved item and undoing it", () => {
  it("removing takes it off the list, and undo puts back the same record with its own timer", () => {
    const d = defaultLedgerData(NOW, "America/New_York");
    d.waitingList.push(item());
    const before = JSON.stringify(d.waitingList[0]);
    expect(dropWaiting(d, "wait_1")).toBe(true);
    expect(summarize(d, NOW).waitingList).toHaveLength(0);
    expect(restoreWaiting(d, "wait_1")).toBe(true);
    expect(JSON.stringify(d.waitingList[0])).toBe(before);
    expect(summarize(d, NOW).waitingList).toHaveLength(1);
  });
  it("does nothing for an unknown item or one that was already bought", () => {
    const d = defaultLedgerData(NOW, "America/New_York");
    d.waitingList.push(item({ status: "bought" }));
    expect(dropWaiting(d, "nope")).toBe(false);
    expect(dropWaiting(d, "wait_1")).toBe(false);
    expect(restoreWaiting(d, "wait_1")).toBe(false);
  });
  it("won't restore over a newer saved copy of the same product (one active wait per product)", () => {
    const d = defaultLedgerData(NOW, "America/New_York");
    d.waitingList.push(item({ status: "dropped" }), item({ id: "wait_2" }));
    expect(restoreWaiting(d, "wait_1")).toBe(false);
  });
});
