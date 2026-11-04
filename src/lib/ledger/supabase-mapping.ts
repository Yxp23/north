// Turns database rows into LedgerData and back. Pure functions: no network.
// The database keeps each rule as dated VERSIONS (see the migration); the Guardian wants
// { value, changedAt, previous }. These functions translate between the two.
import { RULE_DELAY_MS } from "../guardian/rules";
import type { LateNightWindow } from "../guardian";
import type { AuditEntry, LedgerData, PurchaseRecord, StoredChangeable, StoredRules } from "./types";

// ---- row shapes (what ledger_load returns / ledger_apply takes) ------------------------------

type Ts = string; // timestamptz as text
export type UserRow = {
  id: string; time_zone: string; base_balance_cents: number; protected_cents: number; weekly_budget_cents: number;
  paypal_vault_id: string | null; paypal_customer_id: string | null; paypal_saved_at: Ts | null; version: number;
};
export type RuleRow = { kind: RuleKind; enabled: boolean; params: unknown; source_text?: string | null; created_at: Ts; effective_at: Ts };
export type PurchaseRow = {
  id: string; attempt_id: string; product_id: string; name: string; category: string; image_url: string;
  amount_cents: number; currency: string; status: PurchaseRecord["status"]; created_at: Ts; paid_at: Ts | null;
  refunded_at: Ts | null; paypal_order_id: string | null; capture_id: string | null; paid_via: "checkout" | "webhook" | null;
  webhook_confirmed_at: Ts | null; overrode_wait: boolean; decision_code: string; failure_reason: string | null;
};
export type Snapshot = {
  user: UserRow; rules: RuleRow[]; purchases: PurchaseRow[];
  audit: { at: Ts; type: string; detail: string }[]; webhook_event_ids: string[];
};
export type Changes = {
  user?: Record<string, unknown>;
  purchases?: PurchaseRow[];
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
  if (kind === "wait_over_amount") return { cents: value };
  if (kind === "essentials") return { categories: value };
  return { afterHour: (value as LateNightWindow).afterHour, untilHour: (value as LateNightWindow).untilHour };
}
function fromParams(kind: RuleKind, params: any): any {
  if (kind === "wait_over_amount") return params.cents;
  if (kind === "essentials") return params.categories;
  return { afterHour: params.afterHour, untilHour: params.untilHour };
}

const iso = (v: string | Date) => new Date(v).toISOString();
const ms = (v: string) => new Date(v).getTime();

/**
 * Newest version -> value. changedAt = effective_at - 24h, so the Guardian's "counts after 24 hours"
 * lines up exactly with effective_at. previous = the version that was in force when the newest was asked for.
 */
function ruleFromVersions(kind: RuleKind, rows: RuleRow[]): StoredChangeable<any> {
  const versions = rows.filter((r) => r.kind === kind).sort((a, b) => ms(a.effective_at) - ms(b.effective_at) || ms(a.created_at) - ms(b.created_at));
  const newest = versions.at(-1);
  if (!newest) return { value: null, changedAt: new Date(0).toISOString(), previous: null };
  const older = versions.slice(0, -1).filter((r) => ms(r.effective_at) <= ms(newest.created_at));
  const inForce = older.at(-1);
  const val = (r: RuleRow) => (r.enabled ? fromParams(kind, r.params) : null);
  return {
    value: val(newest),
    changedAt: new Date(ms(newest.effective_at) - RULE_DELAY_MS).toISOString(),
    previous: inForce ? val(inForce) : null,
  };
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

export function fromSnapshot(s: Snapshot): { data: LedgerData; version: number } {
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
const emptyValue = (kind: RuleKind) => (kind === "wait_over_amount" ? 0 : kind === "essentials" ? [] : { afterHour: 0, untilHour: 0 });

function purchaseToRow(p: PurchaseRecord): PurchaseRow {
  return {
    id: p.id, attempt_id: p.attemptId, product_id: p.productId, name: p.name, category: p.category, image_url: p.imageUrl,
    amount_cents: p.amountCents, currency: p.currency, status: p.status, created_at: p.createdAt, paid_at: p.paidAt ?? null,
    refunded_at: p.refundedAt ?? null, paypal_order_id: p.paypalOrderId ?? null, capture_id: p.captureId ?? null,
    paid_via: p.paidVia ?? null, webhook_confirmed_at: p.webhookConfirmedAt ?? null, overrode_wait: p.overrodeWait,
    decision_code: p.decisionCode, failure_reason: p.failureReason ?? null,
  };
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
  if (Object.keys(user).length) c.user = user;

  const old = new Map(before.purchases.map((p) => [p.id, p]));
  for (const id of old.keys()) {
    if (!after.purchases.some((p) => p.id === id)) throw new Error(`A purchase (${id}) can't be deleted`);
  }
  const purchases = after.purchases.filter((p) => !same(old.get(p.id), p)).map(purchaseToRow);
  if (purchases.length) c.purchases = purchases;

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
    // A change is asked for at changedAt and starts to count 24 hours later.
    rules.push({
      kind, enabled: a.value !== null, params: toParams(kind, a.value ?? emptyValue(kind)),
      created_at: a.changedAt, effective_at: new Date(ms(a.changedAt) + RULE_DELAY_MS).toISOString(),
    });
  }
  if (rules.length) c.rules = rules;

  return Object.keys(c).length ? c : null;
}
