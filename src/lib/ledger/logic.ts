// Ledger rules: pure functions over LedgerData (no files, no network).
import type { ParsedWebhook } from "../paypal-webhook";
import type { Rules, UserState } from "../guardian";
import type { AgentCheckpointData, AuditEntry, HomeSummary, LedgerData, PurchaseRecord, StoredChangeable, StoredRules, WaitingItem, WaitingView } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any -- upgradeLedgerData reads old, loosely shaped data */
const DAY_MS = 24 * 60 * 60 * 1000;

/** No assistants, no requests, and "Ask me every time". */
export const defaultAgentCheckpoint = (): AgentCheckpointData => ({ agents: [], requests: [], permission: { value: null, changedAt: "1970-01-01T00:00:00.000Z", previous: null } });

/** A request nobody answered for a day is no longer asked about. */
export const REQUEST_LIFETIME_MS = DAY_MS;

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
      // Demo rules: wait on buys over $50.00 (gentle), and wait on buys after 9 PM (firm, a day).
      waitOverCents: settled({ cents: 5000, strength: "gentle" as const }),
      waitAfterHour: settled({ afterHour: 21, untilHour: 5, strength: "firm" as const, waitHours: 24 }),
      essentials: settled(["household", "personal care", "groceries", "medicine"]),
    },
    purchases: [],
    waitingList: [],
    flaggedSellers: [],
    priceWatch: { watches: [], notices: [] },
    agentCheckpoint: defaultAgentCheckpoint(),
    webhookEventIds: [],
    audit: [],
  };
}

/** Fill in what older saved data lacks (a waiting list, rule strength), so a dev file from before still works. */
export function upgradeLedgerData(d: LedgerData): LedgerData {
  d.waitingList ??= [];
  d.flaggedSellers ??= [];
  d.priceWatch ??= { watches: [], notices: [] };
  d.agentCheckpoint ??= defaultAgentCheckpoint();
  const up = (r: StoredChangeable<any>) => {
    const fix = (v: any) => (typeof v === "number" ? { cents: v, strength: "gentle" } : v && v.strength === undefined && !Array.isArray(v) ? { ...v, strength: "gentle" } : v);
    r.value = fix(r.value);
    r.previous = fix(r.previous);
  };
  up(d.rules.waitOverCents);
  up(d.rules.waitAfterHour);
  return d;
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

/** The "Buy now" taps this week, from the audit log. */
export function buyNowThisWeek(data: LedgerData, now: Date): number {
  const start = weekStartDate(now, data.timeZone);
  return data.audit.filter((a) => a.type === "override" && localDate(new Date(a.at), data.timeZone) >= start).length;
}

/** The waiting-list entry for a product that is still waiting (there is at most one). */
export function activeWaiting(data: LedgerData, productId: string): WaitingItem | undefined {
  return data.waitingList.find((w) => w.productId === productId && w.status === "waiting");
}

export const waitingView = (w: WaitingItem, now: Date): WaitingView => ({
  id: w.id, productId: w.productId, name: w.name, imageUrl: w.imageUrl, amountCents: w.amountCents,
  remindAt: w.remindAt, ready: now.getTime() >= new Date(w.remindAt).getTime(),
});

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
    waitingList: data.waitingList
      .filter((w) => w.status === "waiting")
      .sort((a, b) => a.remindAt.localeCompare(b.remindAt))
      .map((w) => waitingView(w, now)),
    buyNowThisWeek: buyNowThisWeek(data, now),
    priceNotices: data.priceWatch.notices.filter((n) => !n.dismissed).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    watching: data.priceWatch.watches.filter((w) => w.active).map((w) => ({ productId: w.productId, name: w.name, imageUrl: w.imageUrl })),
    assistantAsks: data.agentCheckpoint.requests
      .filter((r) => r.status === "pending" && now.getTime() - new Date(r.createdAt).getTime() < REQUEST_LIFETIME_MS)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ id: r.id, agentName: r.agentName, name: r.name, imageUrl: r.imageUrl, quantity: r.quantity, amountCents: r.amountCents, reason: r.reason, needsOverride: r.needsOverride, note: r.guardianReason })),
  };
}

// ---- changes ---------------------------------------------------------------

export function addAudit(data: LedgerData, type: string, detail: string, now: Date) {
  const entry: AuditEntry = { at: now.toISOString(), type, detail };
  data.audit.push(entry);
  if (data.audit.length > 300) data.audit.splice(0, data.audit.length - 300);
}

const bareDomain = (d: string) => d.trim().toLowerCase().replace(/^www\./, "");

/** Remember a seller as a scam. Returns false if they were already flagged. A flag is never removed. */
export function flagSeller(data: LedgerData, domain: string, reason: string, now: Date): boolean {
  const d = bareDomain(domain);
  if (!d || data.flaggedSellers.some((f) => f.domain === d)) return false;
  data.flaggedSellers.push({ domain: d, flaggedAt: now.toISOString(), reason });
  return true;
}

export function isSellerFlagged(data: Pick<LedgerData, "flaggedSellers">, domain: string | undefined): boolean {
  return !!domain && data.flaggedSellers.some((f) => f.domain === bareDomain(domain));
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

/** Mark a buy refunded (and remember when). Safe to call twice. */
export function markRefunded(data: LedgerData, purchaseId: string, now: Date) {
  const p = data.purchases.find((x) => x.id === purchaseId);
  if (!p || p.status === "refunded") return;
  p.status = "refunded";
  p.refundedAt = now.toISOString();
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
    // A payment is only believed if it is for exactly what we asked PayPal to take. Anything else (a different amount or
    // currency, or none at all) is written down and NOT counted: fail closed.
    if (ev.amountCents !== p.amountCents || ev.currency !== p.currency) {
      addAudit(data, "webhook_amount_mismatch", `${p.id}: PayPal reported ${ev.amountCents ?? "no amount"} ${ev.currency ?? ""} for capture ${ev.captureId}, we asked for ${p.amountCents} ${p.currency}. Not counted.`, now);
      return { changed: true, note: "amount mismatch" };
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
  // Only a FULL refund gives the money back to the budget. A partial or odd refund is written down and changes nothing.
  if (ev.amountCents !== p.amountCents || ev.currency !== p.currency) {
    addAudit(data, "webhook_partial_refund", `${p.id}: refund ${ev.refundId} was for ${ev.amountCents ?? "no amount"} ${ev.currency ?? ""}, not all of ${p.amountCents} ${p.currency}. Left as it is.`, now);
    return { changed: true, note: "partial refund" };
  }
  markRefunded(data, p.id, now);
  addAudit(data, "webhook_refunded", `${p.id} refund ${ev.refundId}`, now);
  return { changed: true, note: "refunded" };
}
