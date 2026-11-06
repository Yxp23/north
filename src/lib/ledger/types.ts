import type { BigBuyRule, LateNightRule, RuleId } from "../guardian";

// What we keep. Dates are ISO strings so the data saves as plain JSON.

export type StoredChangeable<T> = {
  value: T | null;
  /** The Guardian counts `value` from changedAt + 24 hours. A change that starts at once is dated 24 hours back. */
  changedAt: string;
  previous: T | null;
  /** When the user really asked, only when that differs from changedAt (a change that started at once). */
  askedAt?: string;
};

export type StoredRules = {
  waitOverCents: StoredChangeable<BigBuyRule>;
  waitAfterHour: StoredChangeable<LateNightRule>;
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

/** A buy saved by a FIRM rule. After the wait it is a normal buy (the Guardian checks everything again). */
export type WaitingItem = {
  id: string;
  productId: string;
  name: string;
  category: string;
  imageUrl: string;
  /** The price when it was saved. When you buy, the price is read from the store again. */
  amountCents: number;
  currency: string;
  createdAt: string;
  /** When the wait is over and we remind the user. */
  remindAt: string;
  waitHours: number;
  /** Which rules made it wait. */
  rules: RuleId[];
  status: "waiting" | "bought" | "dropped";
  /** The buy it became. */
  purchaseId?: string;
};

/** A seller the scam checker said looks like a scam. The Guardian refuses to pay them. Never removed. */
export type FlaggedSeller = { domain: string; flaggedAt: string; reason: string };

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
  waitingList: WaitingItem[];
  /** Sellers flagged as scams. Kept in their own list (not the audit log, which forgets old entries). */
  flaggedSellers: FlaggedSeller[];
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

/** What the home screen shows for one waiting-list item. */
export type WaitingView = {
  id: string;
  productId: string;
  name: string;
  imageUrl: string;
  amountCents: number;
  remindAt: string;
  /** True once the wait is over. */
  ready: boolean;
};

export type HomeSummary = {
  weeklyBudgetCents: number;
  spentThisWeekCents: number;
  /** Budget left, and never more than the spendable money. Never below zero. */
  leftCents: number;
  protectedCents: number;
  weekStart: string;
  purchases: PurchaseView[];
  waitingList: WaitingView[];
  /** How many times the user tapped "Buy now" this week. */
  buyNowThisWeek: number;
};
