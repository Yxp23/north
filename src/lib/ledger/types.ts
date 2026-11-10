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

/** An item the Price Watcher keeps an eye on: a waiting-list item, or one the user chose to wait on. */
export type Watch = {
  productId: string;
  name: string;
  imageUrl: string;
  /** "chosen": the user tapped "Wait and watch". "waiting_list": it is on the waiting list. */
  source: "chosen" | "waiting_list";
  startedAt: string;
  /** The price when the user started waiting. A drop is measured from here. */
  baselineCents: number;
  /** The price at the last check (from the store, never from model text). */
  lastCents?: number;
  /** Whether it was in stock at the last check. */
  lastAvailable: boolean;
  lastCheckedAt?: string;
  /** "kind:cents" of the last message, so the same news is never told twice. */
  lastNoticeKey?: string;
  active: boolean;
};

/** Price news for the user. It can only inform: "Still want it?" opens the product, and buying goes through the Guardian. */
export type PriceNotice = {
  id: string;
  productId: string;
  name: string;
  imageUrl: string;
  kind: "drop" | "back_to_normal" | "sold_out" | "back_in_stock";
  /** Plain words. Every price in it was filled in by code from store values. */
  message: string;
  priceCents?: number;
  createdAt: string;
  dismissed: boolean;
};

export type PriceWatchData = { watches: Watch[]; notices: PriceNotice[] };

/**
 * What a connected assistant may do (least privilege). Each one is one MCP tool. A key made before scopes existed has none
 * stored and gets all four, which is exactly what it could do before.
 */
export const AGENT_SCOPES = ["request_purchase", "read_rules", "read_week_money", "read_status"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

/** An outside AI assistant the user connected to the North Agent Checkpoint (MCP). It has its own key; only the key's hash is kept. */
export type ConnectedAgent = {
  id: string;
  name: string;
  /** SHA-256 of the key. The key itself is shown once when it is made and never stored. */
  keyHash: string;
  createdAt: string;
  /** What this assistant may do. Missing = all four (an older assistant). */
  scopes?: AgentScope[];
  /** Set when the user taps Disconnect. The key stops working at once. */
  revokedAt?: string;
  lastUsedAt?: string;
};

export type AgentRequestStatus =
  | "pending" // waiting for the person's Yes / No
  | "bought"
  | "declined"
  | "refused" // the Guardian said no
  | "saved_for_later" // a firm wait: on the waiting list
  | "failed"
  | "expired";

/** A step line for the activity panel. */
export type RequestStep = { label: string; detail?: string; warn?: boolean };

/** One thing an assistant asked to buy. */
export type AgentRequest = {
  id: string;
  agentId: string;
  /** The assistant's own idempotency key: asking again with the same key gets the same answer and never makes a second request. */
  requestKey?: string;
  /** What the assistant typed for "product" (an id or words), kept to check a repeated request key is for the same thing. */
  askedFor?: string;
  agentName: string;
  productId: string;
  name: string;
  imageUrl: string;
  /** Store price of one. From the store, never from the assistant. */
  unitCents: number;
  quantity: number;
  amountCents: number;
  /** What the assistant said. UNTRUSTED text: shown as plain text only, clipped. */
  reason: string;
  /** What the Guardian said when asked. */
  decision: "approve" | "wait" | "refuse";
  guardianCode: string;
  guardianReason: string;
  /** The person must say Yes before anything is bought. */
  needsPerson: boolean;
  /** The Yes is a "Buy now" on a gentle wait. Only the person can do that. */
  needsOverride: boolean;
  status: AgentRequestStatus;
  createdAt: string;
  answeredAt?: string;
  purchaseId?: string;
  steps: RequestStep[];
};

/** Connected assistants, what they asked, and what the person allows them to do on their own. */
export type AgentCheckpointData = {
  agents: ConnectedAgent[];
  requests: AgentRequest[];
  /**
   * "My assistant can buy must-have things under $X without asking". null = "Ask me every time" (the default).
   * Same timing as the other rules: letting the assistant do MORE takes a day, doing LESS starts at once.
   */
  permission: StoredChangeable<{ underCents: number }>;
};

export type AuditEntry = {
  at: string;
  type: string;
  detail: string;
  /** Tamper-evidence (see audit-chain.ts): the HMAC of the entry before this one, and of this one. Added when saved. */
  prevHash?: string;
  hash?: string;
};

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
  /** What the Price Watcher is watching, and the price news it wrote. */
  priceWatch: PriceWatchData;
  /** The North Agent Checkpoint: connected assistants and their requests. */
  agentCheckpoint: AgentCheckpointData;
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
  /** PayPal's own receipt numbers (not secrets). Shown on receipts and in "Behind the scenes". Missing until PayPal has taken the money. */
  paypalOrderId?: string;
  paypalCaptureId?: string;
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

/** The most recent time the Guardian did not simply approve: a wait, a saved-for-later, or a refusal. From the audit log. */
export type LastStepIn = { at: string; name: string; amountCents: number; decision: "wait" | "waitlist" | "refuse"; code: string;
  /** The item is on the waiting list right now (it was stopped or asked about, then saved), so the card says both in one line. */
  alsoSaved?: boolean };

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
  /** Price news the user has not dismissed, newest first. */
  priceNotices: PriceNotice[];
  /** What is being watched right now. */
  watching: { productId: string; name: string; imageUrl: string }[];
  /** What the person's assistants are asking to buy, waiting for a Yes or No. */
  assistantAsks: AssistantAskView[];
  /** The most recent Guardian decision that was not an approval, or null. */
  lastStepIn: LastStepIn | null;
  /** What North did this week, counted from the audit log. */
  thisWeek: { scamsStopped: number; savedForLater: number; stoppedBuys: number };
};

/** A one-tap card: "Your assistant wants to buy Warm Socks, $11." */
export type AssistantAskView = {
  id: string;
  agentName: string;
  name: string;
  imageUrl: string;
  quantity: number;
  amountCents: number;
  /** The assistant's own words, clipped. Untrusted: show as plain text. */
  reason: string;
  /** Yes means "Buy now" on a wait rule. */
  needsOverride: boolean;
  /** The Guardian's note for the person. */
  note: string;
};
