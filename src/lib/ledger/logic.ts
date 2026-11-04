// Ledger rules: pure functions over LedgerData (no files, no network).
import type { ParsedWebhook } from "../paypal-webhook";
import type { Rules, UserState } from "../guardian";
import type { AuditEntry, HomeSummary, LedgerData, PurchaseRecord, StoredChangeable, StoredRules } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The starting demo state. Rules look 30 days old, so they are fully in effect. */
export function defaultLedgerData(now: Date, timeZone: string): LedgerData {
  const settledAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const settled = <T>(value: T): StoredChangeable<T> => ({ value, changedAt: settledAt, previous: null });
  return {
    version: 1,
    baseBalanceCents: 160_000, // $1,600.00 in the account
    protectedCents: 120_000, // $1,200.00 for rent and bills, so $400.00 can be spent
    weeklyBudgetCents: 40_000, // $400.00 a week
    timeZone,
    rules: {
      waitOverCents: settled(5000), // wait on buys over $50.00
      waitAfterHour: settled({ afterHour: 22, untilHour: 5 }), // wait from 10 PM to 5 AM
      essentials: settled(["household", "personal care", "groceries", "medicine"]),
    },
    purchases: [],
    webhookEventIds: [],
    audit: [],
  };
}

// ---- dates -----------------------------------------------------------------

/** "YYYY-MM-DD" on the user's own calendar. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The Monday of this week, as "YYYY-MM-DD" on the user's calendar. */
export function weekStartDate(now: Date, timeZone: string): string {
  const [y, m, d] = localDate(now, timeZone).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)); // pure calendar math, so no daylight-saving surprises
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

// ---- money -----------------------------------------------------------------

/** Pending buys count too, so two quick taps can't spend the same money twice. */
const counts = (p: PurchaseRecord) => p.status === "paid" || p.status === "pending";

export function spentThisWeekCents(data: LedgerData, now: Date): number {
  const start = weekStartDate(now, data.timeZone);
  return data.purchases
    .filter((p) => counts(p) && localDate(new Date(p.createdAt), data.timeZone) >= start)
    .reduce((sum, p) => sum + p.amountCents, 0);
}

export function balanceCents(data: LedgerData): number {
  return data.baseBalanceCents - data.purchases.filter(counts).reduce((sum, p) => sum + p.amountCents, 0);
}

const reviveRule = <T>(r: StoredChangeable<T>) => ({ value: r.value, changedAt: new Date(r.changedAt), previous: r.previous });

export function toRules(stored: StoredRules): Rules {
  return {
    waitOverCents: reviveRule(stored.waitOverCents),
    waitAfterHour: reviveRule(stored.waitAfterHour),
    essentials: reviveRule(stored.essentials),
  };
}

/** Everything the Guardian needs to know about the user, right now. */
export function buildUserState(data: LedgerData, now: Date): UserState {
  return {
    balanceCents: balanceCents(data),
    protectedCents: data.protectedCents,
    weeklyBudgetCents: data.weeklyBudgetCents,
    spentThisWeekCents: spentThisWeekCents(data, now),
    timeZone: data.timeZone,
    rules: toRules(data.rules),
  };
}

export function summarize(data: LedgerData, now: Date): HomeSummary {
  const spent = spentThisWeekCents(data, now);
  const spendable = balanceCents(data) - data.protectedCents;
  return {
    weeklyBudgetCents: data.weeklyBudgetCents,
    spentThisWeekCents: spent,
    leftCents: Math.max(0, Math.min(data.weeklyBudgetCents - spent, spendable)),
    protectedCents: data.protectedCents,
    weekStart: weekStartDate(now, data.timeZone),
    purchases: [...data.purchases]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, amountCents: p.amountCents, status: p.status, at: p.createdAt })),
  };
}

// ---- changes ---------------------------------------------------------------

export function addAudit(data: LedgerData, type: string, detail: string, now: Date) {
  const entry: AuditEntry = { at: now.toISOString(), type, detail };
  data.audit.push(entry);
  if (data.audit.length > 300) data.audit.splice(0, data.audit.length - 300);
}

/** Mark a buy paid. A refunded buy stays refunded (events can arrive out of order). */
export function markPaid(
  data: LedgerData,
  purchaseId: string,
  info: { captureId?: string; orderId?: string; via: "checkout" | "webhook" },
  now: Date,
) {
  const p = data.purchases.find((x) => x.id === purchaseId);
  if (!p) return;
  p.captureId ??= info.captureId;
  p.paypalOrderId ??= info.orderId;
  if (p.status === "refunded") return;
  if (p.status !== "paid") {
    p.status = "paid";
    p.paidAt = now.toISOString();
    p.paidVia = info.via;
  }
}

/** Apply a verified, parsed webhook. Safe to call twice with the same event. */
export function applyWebhook(data: LedgerData, ev: ParsedWebhook, now: Date): { changed: boolean; note: string } {
  if (ev.kind === "ignored") return { changed: false, note: `ignored ${ev.eventType}` };
  if (data.webhookEventIds.includes(ev.eventId)) return { changed: false, note: "duplicate event" };
  data.webhookEventIds.push(ev.eventId);
  if (data.webhookEventIds.length > 500) data.webhookEventIds.shift();

  if (ev.kind === "completed") {
    const p = data.purchases.find(
      (x) => x.id === ev.customId || (ev.captureId && x.captureId === ev.captureId) || (ev.orderId && x.paypalOrderId === ev.orderId),
    );
    if (!p) {
      addAudit(data, "webhook_unknown_payment", `capture ${ev.captureId} is not one of ours`, now);
      return { changed: false, note: "unknown payment" };
    }
    const wasPaid = p.status === "paid";
    markPaid(data, p.id, { captureId: ev.captureId, orderId: ev.orderId, via: "webhook" }, now);
    p.webhookConfirmedAt = now.toISOString();
    addAudit(data, "webhook_completed", `${p.id} capture ${ev.captureId}${wasPaid ? " (already paid)" : ""}`, now);
    return { changed: true, note: wasPaid ? "confirmed" : "paid" };
  }

  const p = ev.captureId ? data.purchases.find((x) => x.captureId === ev.captureId) : undefined;
  if (!p) {
    addAudit(data, "webhook_unknown_refund", `refund ${ev.refundId} for ${ev.captureId ?? "unknown capture"}`, now);
    return { changed: false, note: "unknown refund" };
  }
  p.status = "refunded";
  p.refundedAt = now.toISOString();
  addAudit(data, "webhook_refunded", `${p.id} refund ${ev.refundId}`, now);
  return { changed: true, note: "refunded" };
}
