import type { LateNightWindow } from "../guardian";

// What we keep. Dates are ISO strings so the data saves as plain JSON.

export type StoredChangeable<T> = { value: T | null; changedAt: string; previous: T | null };

export type StoredRules = {
  waitOverCents: StoredChangeable<number>;
  waitAfterHour: StoredChangeable<LateNightWindow>;
  essentials: StoredChangeable<string[]>;
};

/** pending = we started the charge. paid = PayPal took the money. */
export type PurchaseStatus = "pending" | "paid" | "refunded" | "failed";

export type PurchaseRecord = {
  id: string;
  /** One per tap on Buy. A repeated tap with the same id can never charge twice. */
  attemptId: string;
  productId: string;
  name: string;
  category: string;
  imageUrl: string;
  amountCents: number;
  currency: string;
  status: PurchaseStatus;
  createdAt: string;
  paidAt?: string;
  refundedAt?: string;
  paypalOrderId?: string;
  captureId?: string;
  /** Which path told us the money moved. */
  paidVia?: "checkout" | "webhook";
  webhookConfirmedAt?: string;
  overrodeWait: boolean;
  /** The Guardian's code, e.g. "ok" or "ok_override". */
  decisionCode: string;
  failureReason?: string;
};

/** The saved PayPal account (a vault token). Server-only: never sent to the browser. */
export type PaypalVault = { vaultId: string; customerId?: string; savedAt: string };

export type AuditEntry = { at: string; type: string; detail: string };

export type LedgerData = {
  version: 1;
  /** Money in the account before any North purchases. */
  baseBalanceCents: number;
  /** Rent and bills. Never spendable. */
  protectedCents: number;
  weeklyBudgetCents: number;
  timeZone: string;
  rules: StoredRules;
  /** Set once the user connects PayPal. Kept when the demo is reset. */
  paypalVault?: PaypalVault;
  purchases: PurchaseRecord[];
  webhookEventIds: string[];
  audit: AuditEntry[];
};

/** What the home screen shows for one purchase. */
export type PurchaseView = {
  id: string;
  name: string;
  imageUrl: string;
  amountCents: number;
  status: PurchaseStatus;
  at: string;
};

export type HomeSummary = {
  weeklyBudgetCents: number;
  spentThisWeekCents: number;
  /** Budget left, and never more than the spendable money. Never below zero. */
  leftCents: number;
  protectedCents: number;
  weekStart: string;
  purchases: PurchaseView[];
};
