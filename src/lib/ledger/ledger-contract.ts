// The same behavior tests for EVERY ledger (memory, file, Supabase). If a ledger passes these,
// the rest of the app can't tell which one it is talking to.
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Ledger } from "./ledger";
import { applyWebhook, buildUserState } from "./logic";
import type { BigBuyRule, LateNightRule, Strength } from "../guardian";
import type { PurchaseRecord, WaitingItem } from "./types";

export type LedgerHarness = { ledger: Ledger; cleanup?: () => Promise<void> };

const NOW = new Date("2026-11-04T17:00:00Z");

const big = (cents: number, strength: Strength = "gentle", waitHours?: number): BigBuyRule => ({ cents, strength, ...(waitHours ? { waitHours } : {}) });
const late = (afterHour: number, untilHour: number, strength: Strength = "gentle", waitHours?: number): LateNightRule => ({ afterHour, untilHour, strength, ...(waitHours ? { waitHours } : {}) });

const waitingItem = (over: Partial<WaitingItem> = {}): WaitingItem => ({
  id: `wait_${randomUUID()}`, productId: "ENVDwLq", name: "Over-Ear Headphones", category: "electronics", imageUrl: "https://cdn.example/x.png",
  amountCents: 34_900, currency: "USD", createdAt: "2026-11-04T22:00:00.000Z", remindAt: "2026-11-05T22:00:00.000Z", waitHours: 24,
  rules: ["big_buy", "late_night"], status: "waiting", ...over,
});

const fullPurchase = (over: Partial<PurchaseRecord> = {}): PurchaseRecord => ({
  id: `pur_${randomUUID()}`, attemptId: `attempt-${randomUUID()}`, productId: "ENVDwLq", name: "Over-Ear Headphones", category: "electronics",
  imageUrl: "https://cdn.example/x.png", amountCents: 34_900, currency: "USD", status: "paid",
  createdAt: "2026-11-04T16:00:00.000Z", paidAt: "2026-11-04T16:00:02.000Z", paypalOrderId: "ORD1", captureId: "CAP1",
  paidVia: "checkout", webhookConfirmedAt: "2026-11-04T16:00:30.000Z", overrodeWait: true, decisionCode: "ok_override",
  ...over,
});

export function ledgerContract(name: string, make: () => Promise<LedgerHarness>) {
  async function withLedger(fn: (l: Ledger) => Promise<void>) {
    const h = await make();
    try {
      await fn(h.ledger);
    } finally {
      await h.cleanup?.();
    }
  }

  describe(`${name} ledger contract`, () => {
    it("starts with the demo defaults", () =>
      withLedger(async (l) => {
        const d = await l.read();
        expect(d).toMatchObject({ baseBalanceCents: 160_000, protectedCents: 120_000, weeklyBudgetCents: 40_000, timeZone: "America/New_York" });
        expect(d.purchases).toEqual([]);
        expect(d.paypalVault).toBeUndefined();
        // Demo rules: over $50 is gentle; after 9 PM is firm (a day).
        expect(d.rules.waitOverCents.value).toEqual(big(5000, "gentle"));
        expect(d.rules.waitAfterHour.value).toEqual(late(21, 5, "firm", 24));
        expect(d.rules.essentials.value).toEqual(["household", "personal care", "groceries", "medicine"]);
      }));

    it("starting rules are fully in effect (settled long ago)", () =>
      withLedger(async (l) => {
        const state = buildUserState(await l.read(), NOW);
        expect(state.rules.waitOverCents.changedAt.getTime()).toBeLessThan(NOW.getTime() - 24 * 3600_000);
      }));

    it("keeps a purchase with every field, exactly", () =>
      withLedger(async (l) => {
        const p = fullPurchase();
        await l.update((d) => void d.purchases.push(p));
        expect((await l.read()).purchases).toEqual([p]);
      }));

    it("keeps a bare pending purchase (no optional fields)", () =>
      withLedger(async (l) => {
        const p = fullPurchase({ status: "pending", paidAt: undefined, paypalOrderId: undefined, captureId: undefined, paidVia: undefined, webhookConfirmedAt: undefined, overrodeWait: false, decisionCode: "ok" });
        await l.update((d) => void d.purchases.push(p));
        expect((await l.read()).purchases).toEqual([p]);
      }));

    it("saves later changes to a purchase", () =>
      withLedger(async (l) => {
        await l.update((d) => void d.purchases.push(fullPurchase({ status: "pending", paidAt: undefined, captureId: undefined })));
        await l.update((d) => {
          d.purchases[0].status = "refunded";
          d.purchases[0].refundedAt = "2026-11-04T18:00:00.000Z";
          d.purchases[0].failureReason = "none";
        });
        const p = (await l.read()).purchases[0];
        expect(p).toMatchObject({ status: "refunded", refundedAt: "2026-11-04T18:00:00.000Z", failureReason: "none" });
        expect(p.amountCents).toBe(34_900);
      }));

    it("never allows two purchases with the same attempt id", () =>
      withLedger(async (l) => {
        const p = fullPurchase();
        await l.update((d) => void d.purchases.push(p));
        await expect(l.update((d) => void d.purchases.push(fullPurchase({ attemptId: p.attemptId })))).rejects.toThrow();
        await expect(l.update((d) => void d.purchases.push(fullPurchase({ id: p.id })))).rejects.toThrow();
        expect((await l.read()).purchases).toHaveLength(1);
      }));

    it("appends audit entries and webhook ids", () =>
      withLedger(async (l) => {
        await l.update((d) => {
          d.audit.push({ at: "2026-11-04T10:00:00.000Z", type: "decision", detail: "a" });
          d.webhookEventIds.push("WH-a");
        });
        await l.update((d) => {
          d.audit.push({ at: "2026-11-04T10:00:01.000Z", type: "paid", detail: "b" });
          d.webhookEventIds.push("WH-b");
        });
        const d = await l.read();
        expect(d.audit.map((e) => e.detail)).toEqual(["a", "b"]);
        expect(d.webhookEventIds).toEqual(["WH-a", "WH-b"]);
      }));

    it("a repeated webhook event does nothing the second time", () =>
      withLedger(async (l) => {
        const p = fullPurchase({ status: "pending", paidAt: undefined, captureId: undefined, webhookConfirmedAt: undefined });
        await l.update((d) => void d.purchases.push(p));
        const ev = { kind: "completed" as const, eventId: `WH-${randomUUID()}`, captureId: "C9", customId: p.id };
        expect((await l.update((d) => applyWebhook(d, ev, NOW))).changed).toBe(true);
        expect((await l.update((d) => applyWebhook(d, ev, NOW))).changed).toBe(false);
        expect((await l.read()).purchases[0].status).toBe("paid");
      }));

    it("saves the connected PayPal, and can clear it", () =>
      withLedger(async (l) => {
        await l.update((d) => void (d.paypalVault = { vaultId: "V1", customerId: "C1", savedAt: "2026-11-04T12:00:00.000Z" }));
        expect((await l.read()).paypalVault).toEqual({ vaultId: "V1", customerId: "C1", savedAt: "2026-11-04T12:00:00.000Z" });
        await l.update((d) => void (d.paypalVault = undefined));
        expect((await l.read()).paypalVault).toBeUndefined();
      }));

    it("saves money settings", () =>
      withLedger(async (l) => {
        await l.update((d) => {
          d.weeklyBudgetCents = 12_300;
          d.protectedCents = 99_000;
          d.baseBalanceCents = 150_000;
        });
        expect(await l.read()).toMatchObject({ weeklyBudgetCents: 12_300, protectedCents: 99_000, baseBalanceCents: 150_000 });
      }));

    it("saves nothing when a change throws", () =>
      withLedger(async (l) => {
        await expect(
          l.update((d) => {
            d.weeklyBudgetCents = 1;
            d.purchases.push(fullPurchase());
            throw new Error("boom");
          }),
        ).rejects.toThrow("boom");
        const d = await l.read();
        expect(d.weeklyBudgetCents).toBe(40_000);
        expect(d.purchases).toEqual([]);
      }));

    it("returns what the change returns", () =>
      withLedger(async (l) => {
        expect(await l.update(() => 42)).toBe(42);
      }));

    it("does not lose changes when many updates overlap", () =>
      withLedger(async (l) => {
        await Promise.all(Array.from({ length: 12 }, () => l.update((d) => void (d.baseBalanceCents += 1))));
        expect((await l.read()).baseBalanceCents).toBe(160_012);
      }));

    // ---- rules: a change takes 24 hours (the one-day delay) ---------------------------------
    it("a rule change is kept, with the old rule still in force for 24 hours", () =>
      withLedger(async (l) => {
        const changedAt = new Date(NOW.getTime() - 3600_000).toISOString(); // asked for 1 hour ago
        await l.update((d) => void (d.rules.waitOverCents = { value: big(20_000), changedAt, previous: big(5000) }));

        const d = await l.read();
        expect(d.rules.waitOverCents.value).toEqual(big(20_000));
        expect(d.rules.waitOverCents.previous).toEqual(big(5000));
        expect(d.rules.waitOverCents.changedAt).toBe(changedAt);

        // Guardian view: not in effect yet at NOW, in effect 24h after it was asked for.
        const { effective } = await import("../guardian/rules");
        const rule = buildUserState(d, NOW).rules.waitOverCents;
        expect(effective(rule, NOW)).toEqual(big(5000));
        expect(effective(rule, new Date(new Date(changedAt).getTime() + 24 * 3600_000))).toEqual(big(20_000));
      }));

    it("turning a rule off is a change too, and it keeps the old rule meanwhile", () =>
      withLedger(async (l) => {
        const changedAt = new Date(NOW.getTime() - 3600_000).toISOString();
        await l.update((d) => void (d.rules.waitOverCents = { value: null, changedAt, previous: big(5000) }));
        const d = await l.read();
        expect(d.rules.waitOverCents).toEqual({ value: null, changedAt, previous: big(5000) });
      }));

    it("keeps a changed essentials list and late-night window", () =>
      withLedger(async (l) => {
        const changedAt = new Date(NOW.getTime() - 3600_000).toISOString();
        await l.update((d) => {
          d.rules.essentials = { value: ["groceries", "gadgets"], changedAt, previous: ["household", "personal care", "groceries", "medicine"] };
          d.rules.waitAfterHour = { value: late(23, 6), changedAt, previous: late(21, 5, "firm", 24) };
        });
        const d = await l.read();
        expect(d.rules.essentials.value).toEqual(["groceries", "gadgets"]);
        expect(d.rules.waitAfterHour.value).toEqual(late(23, 6));
        expect(d.rules.waitAfterHour.previous).toEqual(late(21, 5, "firm", 24));
      }));

    it("two changes in a row: the older pending one is replaced, the rule in force stays", () =>
      withLedger(async (l) => {
        const t1 = new Date(NOW.getTime() - 10 * 3600_000).toISOString();
        const t2 = new Date(NOW.getTime() - 1 * 3600_000).toISOString();
        await l.update((d) => void (d.rules.waitOverCents = { value: big(20_000), changedAt: t1, previous: big(5000) }));
        // The second change happens while the first is still waiting. What is in force is still 5000.
        await l.update((d) => void (d.rules.waitOverCents = { value: big(30_000), changedAt: t2, previous: big(5000) }));
        const d = await l.read();
        expect(d.rules.waitOverCents).toEqual({ value: big(30_000), changedAt: t2, previous: big(5000) });
      }));


    // ---- rule strength ----------------------------------------------------------------------
    it("keeps each rule's strength and firm wait time", () =>
      withLedger(async (l) => {
        const changedAt = new Date(NOW.getTime() - 3600_000).toISOString();
        await l.update((d) => {
          d.rules.waitOverCents = { value: big(7500, "locked"), changedAt, previous: big(5000) };
          d.rules.waitAfterHour = { value: late(20, 6, "firm", 48), changedAt, previous: late(21, 5, "firm", 24) };
        });
        const d = await l.read();
        expect(d.rules.waitOverCents.value).toEqual(big(7500, "locked"));
        expect(d.rules.waitAfterHour.value).toEqual(late(20, 6, "firm", 48));
        expect(d.rules.waitAfterHour.previous).toEqual(late(21, 5, "firm", 24));
      }));

    it("loosening a LOCKED rule is a change like any other: the lock stays for 24 hours", () =>
      withLedger(async (l) => {
        const changedAt = new Date(NOW.getTime() - 3600_000).toISOString();
        await l.update((d) => void (d.rules.waitOverCents = { value: big(5000, "locked"), changedAt: "2026-10-20T00:00:00.000Z", previous: null }));
        await l.update((d) => void (d.rules.waitOverCents = { value: big(5000, "gentle"), changedAt, previous: big(5000, "locked") }));
        const { effective } = await import("../guardian/rules");
        const rule = buildUserState(await l.read(), NOW).rules.waitOverCents;
        expect(effective(rule, NOW)?.strength).toBe("locked");
        expect(effective(rule, new Date(new Date(changedAt).getTime() + 24 * 3600_000))?.strength).toBe("gentle");
      }));

    // ---- waiting list (firm rules) ----------------------------------------------------------
    it("keeps a waiting-list item exactly, and later changes to it", () =>
      withLedger(async (l) => {
        const w = waitingItem();
        await l.update((d) => void d.waitingList.push(w));
        expect((await l.read()).waitingList).toEqual([w]);
        const bought = `pur_${randomUUID()}`;
        await l.update((d) => {
          d.waitingList[0].status = "bought";
          d.waitingList[0].purchaseId = bought;
        });
        expect((await l.read()).waitingList[0]).toEqual({ ...w, status: "bought", purchaseId: bought });
      }));

    it("allows only one item per product to be waiting at a time", () =>
      withLedger(async (l) => {
        await l.update((d) => void d.waitingList.push(waitingItem()));
        await expect(l.update((d) => void d.waitingList.push(waitingItem()))).rejects.toThrow();
        expect((await l.read()).waitingList).toHaveLength(1);
        // Once it is bought or dropped, the same product can be saved again.
        await l.update((d) => {
          d.waitingList[0].status = "dropped";
          d.waitingList.push(waitingItem());
        });
        expect((await l.read()).waitingList).toHaveLength(2);
      }));

    it("never allows a waiting-list item to be deleted", () =>
      withLedger(async (l) => {
        await l.update((d) => void d.waitingList.push(waitingItem()));
        await expect(l.update((d) => void d.waitingList.splice(0, 1))).rejects.toThrow();
      }));

    it("counts the Buy now taps this week from the audit log", () =>
      withLedger(async (l) => {
        const { buyNowThisWeek } = await import("./logic");
        await l.update((d) => {
          d.audit.push({ at: "2026-11-03T15:00:00.000Z", type: "override", detail: "Buy now: A, $1.00" }); // this week (Tue)
          d.audit.push({ at: "2026-11-04T15:00:00.000Z", type: "override", detail: "Buy now: B, $2.00" });
          d.audit.push({ at: "2026-11-04T15:00:01.000Z", type: "decision", detail: "not an override" });
          d.audit.push({ at: "2026-10-30T15:00:00.000Z", type: "override", detail: "Buy now: C, $3.00" }); // last week
        });
        expect(buyNowThisWeek(await l.read(), NOW)).toBe(2);
      }));

    // ---- reset ------------------------------------------------------------------------------
    it("reset goes back to the defaults and keeps the connected PayPal", () =>
      withLedger(async (l) => {
        await l.update((d) => {
          d.paypalVault = { vaultId: "V1", savedAt: "2026-11-04T12:00:00.000Z" };
          d.baseBalanceCents = 5;
          d.purchases.push(fullPurchase());
          d.audit.push({ at: "2026-11-04T10:00:00.000Z", type: "x", detail: "y" });
          d.webhookEventIds.push("WH-reset-1");
          d.waitingList.push(waitingItem());
          d.rules.waitOverCents = { value: big(1), changedAt: "2026-11-04T10:00:00.000Z", previous: big(5000) };
        });
        await l.reset();
        const d = await l.read();
        expect(d.baseBalanceCents).toBe(160_000);
        expect(d.purchases).toEqual([]);
        expect(d.audit).toEqual([]);
        expect(d.webhookEventIds).toEqual([]);
        expect(d.rules.waitOverCents.value).toEqual(big(5000));
        expect(d.paypalVault?.vaultId).toBe("V1");
      }));
  });
}
