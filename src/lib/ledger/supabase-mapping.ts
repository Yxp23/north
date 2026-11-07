// Turns database rows into LedgerData and back. Pure functions: no network.
// The database keeps each rule as dated VERSIONS (see the migration); the Guardian wants
// { value, changedAt, previous }. These functions translate between the two.
import { RULE_DELAY_MS } from "../guardian/rules";
import type { BigBuyRule, LateNightRule, RuleId } from "../guardian";
import type { AuditEntry, FlaggedSeller, LedgerData, PriceWatchData, PurchaseRecord, StoredChangeable, StoredRules, WaitingItem } from "./types";

// ---- row shapes (what ledger_load returns / ledger_apply takes) ------------------------------

type Ts = string; // timestamptz as text
export type UserRow = {
  id: string; time_zone: string; base_balance_cents: number; protected_cents: number; weekly_budget_cents: number;
  paypal_vault_id: string | null; paypal_customer_id: string | null; paypal_saved_at: Ts | null; version: number;
  /** The Price Watcher's watches and news, as JSON. Missing on a database that has not had the price-watcher migration. */
  price_watch?: unknown;
};
export type RuleRow = { kind: RuleKind; enabled: boolean; params: unknown; source_text?: string | null; created_at: Ts; effective_at: Ts };
export type PurchaseRow = {
  id: string; attempt_id: string; product_id: string; name: string; category: string; image_url: string;
  amount_cents: number; currency: string; status: PurchaseRecord["status"]; created_at: Ts; paid_at: Ts | null;
  refunded_at: Ts | null; paypal_order_id: string | null; capture_id: string | null; paid_via: "checkout" | "webhook" | null;
  webhook_confirmed_at: Ts | null; overrode_wait: boolean; decision_code: string; failure_reason: string | null;
};
export type WaitingRow = {
  id: string; product_id: string; name: string; category: string; image_url: string; amount_cents: number; currency: string;
  created_at: Ts; remind_at: Ts; wait_hours: number; rules: RuleId[]; status: WaitingItem["status"]; purchase_id: string | null;
};
export type FlaggedRow = { domain: string; flagged_at: Ts; reason: string };
export type Snapshot = {
  user: UserRow; rules: RuleRow[]; purchases: PurchaseRow[]; waiting_list: WaitingRow[]; flagged_sellers: FlaggedRow[];
  audit: { at: Ts; type: string; detail: string }[]; webhook_event_ids: string[];
};
export type Changes = {
  user?: Record<string, unknown>;
  purchases?: PurchaseRow[];
  waiting_list?: WaitingRow[];
  flagged_sellers?: FlaggedRow[];
  audit?: { at: string; type: string; detail: string }[];
  webhook_event_ids?: string[];
  rules?: Required<Pick<RuleRow, "kind" | "enabled" | "params" | "created_at" | "effective_at">>[];
};

// ---- rules ------------------------------------------------------------------------------------

export type RuleKind = "wait_over_amount" | "wait_after_hour" | "essentials";
const RULES = [
  { key: "waitOverCents", kind: "wait_over_amount" },
  { key: "waitAfterHour", kind: "wait_after_hour" },
  { key: "essentials", kind: "essentials" },
] as const satisfies readonly { key: keyof StoredRules; kind: RuleKind }[];

/* eslint-disable @typescript-eslint/no-explicit-any -- params is free-form jsonb; each kind reads its own shape */
function toParams(kind: RuleKind, value: any): unknown {
  if (kind === "essentials") return { categories: value };
  const strength = value.strength ?? "gentle";
  const wait = value.waitHours ? { waitHours: value.waitHours } : {}; // firm only
  if (kind === "wait_over_amount") return { cents: value.cents, strength, ...wait };
  return { afterHour: value.afterHour, untilHour: value.untilHour, strength, ...wait };
}
/** Rows saved before rule strength existed have no "strength": they were all gentle. */
function fromParams(kind: RuleKind, params: any): any {
  if (kind === "essentials") return params.categories;
  const strength = params.strength ?? "gentle";
  const wait = params.waitHours ? { waitHours: params.waitHours } : {};
  if (kind === "wait_over_amount") return { cents: params.cents, strength, ...wait } satisfies BigBuyRule;
  return { afterHour: params.afterHour, untilHour: params.untilHour, strength, ...wait } satisfies LateNightRule;
}

const iso = (v: string | Date) => new Date(v).toISOString();
const ms = (v: string) => new Date(v).getTime();

/**
 * Versions -> one rule. Each row is one time the user asked for a change:
 *   created_at = when they asked, effective_at = when it starts to count (24 hours later, or at once
 *   for a stricter change).
 * The NEWEST ASK wins. A change still waiting when a newer ask arrives never starts: a stricter change
 * that starts at once must replace a loosening that was still waiting.
 * changedAt = effective_at - 24h, so the Guardian's "counts after 24 hours" lines up with effective_at.
 * previous = the version that was in force when the newest ask was made.
 */
function ruleFromVersions(kind: RuleKind, rows: RuleRow[]): StoredChangeable<any> {
  const asked = rows.filter((r) => r.kind === kind).sort((a, b) => ms(a.created_at) - ms(b.created_at) || ms(a.effective_at) - ms(b.effective_at));
  const newest = asked.at(-1);
  if (!newest) return { value: null, changedAt: new Date(0).toISOString(), previous: null };
  // Walk through the asks in order. A newer ask throws away older ones that had not started yet.
  const timeline: RuleRow[] = [];
  for (const r of asked.slice(0, -1)) {
    while (timeline.length && ms(timeline.at(-1)!.effective_at) > ms(r.created_at)) timeline.pop();
    timeline.push(r);
  }
  while (timeline.length && ms(timeline.at(-1)!.effective_at) > ms(newest.created_at)) timeline.pop();
  const inForce = timeline.at(-1);
  const val = (r: RuleRow) => (r.enabled ? fromParams(kind, r.params) : null);
  const out: StoredChangeable<any> = {
    value: val(newest),
    changedAt: new Date(ms(newest.effective_at) - RULE_DELAY_MS).toISOString(),
    previous: inForce ? val(inForce) : null,
  };
  // A change that started at once was asked for later than its changedAt. Keep the real time.
  if (ms(newest.created_at) !== ms(out.changedAt)) out.askedAt = iso(newest.created_at);
  return out;
}

// ---- snapshot -> LedgerData ------------------------------------------------------------------

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

function purchaseFromRow(r: PurchaseRow): PurchaseRecord {
  const p: PurchaseRecord = {
    id: r.id, attemptId: r.attempt_id, productId: r.product_id, name: r.name, category: r.category, imageUrl: r.image_url,
    amountCents: Number(r.amount_cents), currency: r.currency, status: r.status, createdAt: iso(r.created_at),
    overrodeWait: r.overrode_wait, decisionCode: r.decision_code,
  };
  if (r.paid_at) p.paidAt = iso(r.paid_at);
  if (r.refunded_at) p.refundedAt = iso(r.refunded_at);
  if (r.webhook_confirmed_at) p.webhookConfirmedAt = iso(r.webhook_confirmed_at);
  if (opt(r.paypal_order_id)) p.paypalOrderId = r.paypal_order_id!;
  if (opt(r.capture_id)) p.captureId = r.capture_id!;
  if (opt(r.paid_via)) p.paidVia = r.paid_via!;
  if (opt(r.failure_reason)) p.failureReason = r.failure_reason!;
  return p;
}

function waitingFromRow(r: WaitingRow): WaitingItem {
  const w: WaitingItem = {
    id: r.id, productId: r.product_id, name: r.name, category: r.category, imageUrl: r.image_url, amountCents: Number(r.amount_cents),
    currency: r.currency, createdAt: iso(r.created_at), remindAt: iso(r.remind_at), waitHours: Number(r.wait_hours),
    rules: r.rules, status: r.status,
  };
  if (r.purchase_id) w.purchaseId = r.purchase_id;
  return w;
}

export function fromSnapshot(s: Snapshot): { data: LedgerData; version: number } {
  // An older ledger_load has no waiting_list. Its ledger_apply would also silently DROP waiting-list items,
  // so refuse to run at all until the database is up to date.
  if (!Array.isArray(s.waiting_list)) {
    throw new Error("The database is out of date. Run supabase/migrations/20261105000000_north_rule_strength.sql in the Supabase SQL Editor.");
  }
  // Same for flagged sellers: an old ledger_apply would drop a new flag without saying so.
  if (!Array.isArray(s.flagged_sellers)) {
    throw new Error("The database is out of date. Run supabase/migrations/20261106000000_north_flagged_sellers.sql in the Supabase SQL Editor.");
  }
  // Same for the Price Watcher: an old ledger_apply would drop its news without saying so.
  if (s.user.price_watch === undefined || s.user.price_watch === null) {
    throw new Error("The database is out of date. Run supabase/migrations/20261107000000_north_price_watcher.sql in the Supabase SQL Editor.");
  }
  const u = s.user;
  const data: LedgerData = {
    version: 1,
    baseBalanceCents: Number(u.base_balance_cents),
    protectedCents: Number(u.protected_cents),
    weeklyBudgetCents: Number(u.weekly_budget_cents),
    timeZone: u.time_zone,
    rules: {
      waitOverCents: ruleFromVersions("wait_over_amount", s.rules),
      waitAfterHour: ruleFromVersions("wait_after_hour", s.rules),
      essentials: ruleFromVersions("essentials", s.rules),
    },
    purchases: s.purchases.map(purchaseFromRow),
    waitingList: s.waiting_list.map(waitingFromRow),
    flaggedSellers: s.flagged_sellers.map((f): FlaggedSeller => ({ domain: f.domain, flaggedAt: iso(f.flagged_at), reason: f.reason })),
    priceWatch: priceWatchFromJson(u.price_watch),
    webhookEventIds: [...s.webhook_event_ids].reverse(), // the database sends newest first
    audit: s.audit.map((a): AuditEntry => ({ at: iso(a.at), type: a.type, detail: a.detail })),
  };
  if (u.paypal_vault_id) {
    data.paypalVault = {
      vaultId: u.paypal_vault_id,
      customerId: opt(u.paypal_customer_id),
      savedAt: iso(u.paypal_saved_at ?? new Date(0)),
    };
  }
  return { data, version: Number(u.version) };
}

// ---- LedgerData -> seed / changes ------------------------------------------------------------

/** What ledger_load / ledger_reset need to create a fresh user. */
export function ledgerSeed(d: LedgerData) {
  return {
    time_zone: d.timeZone,
    base_balance_cents: d.baseBalanceCents,
    protected_cents: d.protectedCents,
    weekly_budget_cents: d.weeklyBudgetCents,
    rules: RULES.map(({ key, kind }) => {
      const r = d.rules[key] as StoredChangeable<unknown>;
      // Starting rules are already settled, so they take effect at once.
      return { kind, enabled: r.value !== null, params: toParams(kind, r.value ?? emptyValue(kind)), created_at: r.changedAt, effective_at: r.changedAt };
    }),
  };
}
const emptyValue = (kind: RuleKind) =>
  kind === "wait_over_amount" ? { cents: 0, strength: "gentle" } : kind === "essentials" ? [] : { afterHour: 0, untilHour: 0, strength: "gentle" };

function purchaseToRow(p: PurchaseRecord): PurchaseRow {
  return {
    id: p.id, attempt_id: p.attemptId, product_id: p.productId, name: p.name, category: p.category, image_url: p.imageUrl,
    amount_cents: p.amountCents, currency: p.currency, status: p.status, created_at: p.createdAt, paid_at: p.paidAt ?? null,
    refunded_at: p.refundedAt ?? null, paypal_order_id: p.paypalOrderId ?? null, capture_id: p.captureId ?? null,
    paid_via: p.paidVia ?? null, webhook_confirmed_at: p.webhookConfirmedAt ?? null, overrode_wait: p.overrodeWait,
    decision_code: p.decisionCode, failure_reason: p.failureReason ?? null,
  };
}

function waitingToRow(w: WaitingItem): WaitingRow {
  return {
    id: w.id, product_id: w.productId, name: w.name, category: w.category, image_url: w.imageUrl, amount_cents: w.amountCents,
    currency: w.currency, created_at: w.createdAt, remind_at: w.remindAt, wait_hours: w.waitHours, rules: w.rules,
    status: w.status, purchase_id: w.purchaseId ?? null,
  };
}

/** The jsonb column, read defensively: anything that is not a list is an empty list. */
function priceWatchFromJson(v: unknown): PriceWatchData {
  const o = (v && typeof v === "object" ? v : {}) as Partial<PriceWatchData>;
  return { watches: Array.isArray(o.watches) ? o.watches : [], notices: Array.isArray(o.notices) ? o.notices : [] };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const auditKey = (a: AuditEntry) => `${a.at}|${a.type}|${a.detail}`;

/** What changed between two copies of the ledger. null = nothing to save. */
export function diffChanges(before: LedgerData, after: LedgerData): Changes | null {
  const c: Changes = {};

  const user: Record<string, unknown> = {};
  if (before.timeZone !== after.timeZone) user.time_zone = after.timeZone;
  if (before.baseBalanceCents !== after.baseBalanceCents) user.base_balance_cents = after.baseBalanceCents;
  if (before.protectedCents !== after.protectedCents) user.protected_cents = after.protectedCents;
  if (before.weeklyBudgetCents !== after.weeklyBudgetCents) user.weekly_budget_cents = after.weeklyBudgetCents;
  if (!same(before.paypalVault, after.paypalVault)) {
    user.paypal_vault_id = after.paypalVault?.vaultId ?? null;
    user.paypal_customer_id = after.paypalVault?.customerId ?? null;
    user.paypal_saved_at = after.paypalVault?.savedAt ?? null;
  }
  if (!same(before.priceWatch, after.priceWatch)) user.price_watch = after.priceWatch;
  if (Object.keys(user).length) c.user = user;

  const old = new Map(before.purchases.map((p) => [p.id, p]));
  for (const id of old.keys()) {
    if (!after.purchases.some((p) => p.id === id)) throw new Error(`A purchase (${id}) can't be deleted`);
  }
  const purchases = after.purchases.filter((p) => !same(old.get(p.id), p)).map(purchaseToRow);
  if (purchases.length) c.purchases = purchases;

  const oldWaiting = new Map(before.waitingList.map((w) => [w.id, w]));
  for (const id of oldWaiting.keys()) {
    if (!after.waitingList.some((w) => w.id === id)) throw new Error(`A waiting-list item (${id}) can't be deleted`);
  }
  const waiting = after.waitingList.filter((w) => !same(oldWaiting.get(w.id), w)).map(waitingToRow);
  if (waiting.length) c.waiting_list = waiting;

  for (const f of before.flaggedSellers) {
    if (!after.flaggedSellers.some((x) => x.domain === f.domain)) throw new Error(`A flagged seller (${f.domain}) can't be removed`);
  }
  const oldFlags = new Set(before.flaggedSellers.map((f) => f.domain));
  const flags = after.flaggedSellers.filter((f) => !oldFlags.has(f.domain)).map((f) => ({ domain: f.domain, flagged_at: f.flaggedAt, reason: f.reason }));
  if (flags.length) c.flagged_sellers = flags;

  const seen = new Set(before.audit.map(auditKey));
  const audit = after.audit.filter((a) => !seen.has(auditKey(a)));
  if (audit.length) c.audit = audit;

  const seenEvents = new Set(before.webhookEventIds);
  const events = after.webhookEventIds.filter((e) => !seenEvents.has(e));
  if (events.length) c.webhook_event_ids = events;

  const rules: NonNullable<Changes["rules"]> = [];
  for (const { key, kind } of RULES) {
    const b = before.rules[key] as StoredChangeable<unknown>;
    const a = after.rules[key] as StoredChangeable<unknown>;
    if (same({ v: b.value, t: b.changedAt }, { v: a.value, t: a.changedAt })) continue;
    // A change starts to count 24 hours after changedAt (a change that starts at once is dated 24 hours
    // back). It was asked for at askedAt, or at changedAt when there is no askedAt.
    rules.push({
      kind, enabled: a.value !== null, params: toParams(kind, a.value ?? emptyValue(kind)),
      created_at: a.askedAt ?? a.changedAt, effective_at: new Date(ms(a.changedAt) + RULE_DELAY_MS).toISOString(),
    });
  }
  if (rules.length) c.rules = rules;

  return Object.keys(c).length ? c : null;
}
