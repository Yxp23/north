import { describe, expect, it } from "vitest";
import {
  applyWebhook, buildUserState, defaultLedgerData, localDate, markPaid, spentThisWeekCents, summarize, weekStartDate,
} from "./logic";
import type { LedgerData, PurchaseRecord } from "./types";

const NOW = new Date("2026-11-04T15:00:00Z"); // Wednesday
const TZ = "America/New_York";

function purchase(over: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: "pur_1", attemptId: "att_1", productId: "p1", name: "Notebook", category: "school and office", imageUrl: "https://x/y.png",
    amountCents: 250, currency: "USD", status: "paid", createdAt: NOW.toISOString(), overrodeWait: false, decisionCode: "ok",
    ...over,
  };
}
const data = (purchases: PurchaseRecord[] = []): LedgerData => ({ ...defaultLedgerData(NOW, TZ), purchases });

describe("week math", () => {
  it("formats a local date in the user's time zone", () => {
    // 03:00 UTC on Nov 5 is still Nov 4 in New York.
    expect(localDate(new Date("2026-11-05T03:00:00Z"), TZ)).toBe("2026-11-04");
    expect(localDate(new Date("2026-11-05T03:00:00Z"), "UTC")).toBe("2026-11-05");
  });

  it("starts the week on Monday", () => {
    expect(weekStartDate(NOW, TZ)).toBe("2026-11-02"); // Wed -> Mon
    expect(weekStartDate(new Date("2026-11-02T15:00:00Z"), TZ)).toBe("2026-11-02"); // Mon -> Mon
    expect(weekStartDate(new Date("2026-11-08T15:00:00Z"), TZ)).toBe("2026-11-02"); // Sun -> Mon before
    expect(weekStartDate(new Date("2026-11-09T15:00:00Z"), TZ)).toBe("2026-11-09"); // next Mon
  });

  it("counts a Sunday 11 PM buy in the old week, even though it is Monday in UTC", () => {
    const sundayLate = new Date("2026-11-09T04:00:00Z"); // Sun Nov 8, 11 PM in New York
    const d = data([purchase({ createdAt: sundayLate.toISOString(), amountCents: 1000 })]);
    expect(spentThisWeekCents(d, new Date("2026-11-08T15:00:00Z"))).toBe(1000);
    expect(spentThisWeekCents(d, new Date("2026-11-10T15:00:00Z"))).toBe(0);
  });
});

describe("spending and balance", () => {
  it("counts paid and pending buys, not refunded or failed", () => {
    const d = data([
      purchase({ id: "a", amountCents: 1000, status: "paid" }),
      purchase({ id: "b", amountCents: 500, status: "pending" }),
      purchase({ id: "c", amountCents: 700, status: "refunded" }),
      purchase({ id: "d", amountCents: 900, status: "failed" }),
    ]);
    expect(spentThisWeekCents(d, NOW)).toBe(1500);
    expect(buildUserState(d, NOW).balanceCents).toBe(d.baseBalanceCents - 1500);
  });

  it("builds the Guardian's view of the user", () => {
    const s = buildUserState(data(), NOW);
    expect(s.protectedCents).toBe(120_000);
    expect(s.weeklyBudgetCents).toBe(40_000);
    expect(s.timeZone).toBe(TZ);
    expect(s.rules.waitOverCents.value).toBe(5000);
    expect(s.rules.waitOverCents.changedAt).toBeInstanceOf(Date);
  });

  it("summarizes the home screen", () => {
    const d = data([purchase({ amountCents: 34_900 })]);
    const s = summarize(d, NOW);
    expect(s.spentThisWeekCents).toBe(34_900);
    expect(s.leftCents).toBe(5_100);
    expect(s.protectedCents).toBe(120_000);
    expect(s.purchases).toHaveLength(1);
  });

  it("never shows more left than the spendable money", () => {
    const d = { ...data(), baseBalanceCents: 120_000 + 1000 }; // only $10 above protected
    expect(summarize(d, NOW).leftCents).toBe(1000);
  });

  it("never shows a negative amount left", () => {
    expect(summarize(data([purchase({ amountCents: 50_000 })]), NOW).leftCents).toBe(0);
  });

  it("lists the newest purchases first", () => {
    const d = data([
      purchase({ id: "old", createdAt: "2026-11-02T10:00:00Z" }),
      purchase({ id: "new", createdAt: "2026-11-04T10:00:00Z" }),
    ]);
    expect(summarize(d, NOW).purchases.map((p) => p.id)).toEqual(["new", "old"]);
  });
});

describe("markPaid", () => {
  it("marks a pending buy as paid", () => {
    const d = data([purchase({ status: "pending" })]);
    markPaid(d, "pur_1", { captureId: "C1", orderId: "O1", via: "checkout" }, NOW);
    expect(d.purchases[0]).toMatchObject({ status: "paid", captureId: "C1", paypalOrderId: "O1", paidVia: "checkout" });
  });

  it("does not bring a refunded buy back to paid", () => {
    const d = data([purchase({ status: "refunded", captureId: "C1" })]);
    markPaid(d, "pur_1", { captureId: "C1", via: "checkout" }, NOW);
    expect(d.purchases[0].status).toBe("refunded");
  });
});

describe("applyWebhook", () => {
  const completed = { kind: "completed" as const, eventId: "E1", captureId: "C1", orderId: "O1", customId: "pur_1", amountCents: 250 };

  it("finishes a pending buy using our id (custom_id)", () => {
    const d = data([purchase({ status: "pending" })]);
    expect(applyWebhook(d, completed, NOW).changed).toBe(true);
    expect(d.purchases[0]).toMatchObject({ status: "paid", captureId: "C1", paidVia: "webhook" });
  });

  it("confirms an already-paid buy without changing it", () => {
    const d = data([purchase({ status: "paid", captureId: "C1", paidVia: "checkout" })]);
    applyWebhook(d, completed, NOW);
    expect(d.purchases[0].status).toBe("paid");
    expect(d.purchases[0].paidVia).toBe("checkout");
    expect(d.purchases[0].webhookConfirmedAt).toBeTruthy();
  });

  it("finds a buy by capture id when custom_id is missing", () => {
    const d = data([purchase({ status: "paid", captureId: "C1" })]);
    applyWebhook(d, { ...completed, customId: undefined }, NOW);
    expect(d.purchases[0].webhookConfirmedAt).toBeTruthy();
  });

  it("marks a buy refunded", () => {
    const d = data([purchase({ status: "paid", captureId: "C1" })]);
    const r = applyWebhook(d, { kind: "refunded", eventId: "E2", refundId: "R1", captureId: "C1", amountCents: 250 }, NOW);
    expect(r.changed).toBe(true);
    expect(d.purchases[0].status).toBe("refunded");
    expect(d.purchases[0].refundedAt).toBeTruthy();
  });

  it("ignores a repeated event", () => {
    const d = data([purchase({ status: "pending" })]);
    applyWebhook(d, completed, NOW);
    d.purchases[0].status = "pending"; // pretend something reset it
    const again = applyWebhook(d, completed, NOW);
    expect(again.changed).toBe(false);
    expect(d.purchases[0].status).toBe("pending");
  });

  it("does not crash on a payment we don't know about, and writes it to the audit log", () => {
    const d = data([purchase()]);
    const r = applyWebhook(d, { ...completed, customId: "nope", captureId: "ZZ", orderId: "ZZ" }, NOW);
    expect(r.changed).toBe(false);
    expect(d.audit.at(-1)?.type).toBe("webhook_unknown_payment");
  });

  it("ignores events we don't care about", () => {
    const d = data();
    expect(applyWebhook(d, { kind: "ignored", eventId: "E9", eventType: "X" }, NOW).changed).toBe(false);
  });
});
