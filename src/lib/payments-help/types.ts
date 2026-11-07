// What the payments helper can look at. The agent only sees this interface, never PayPal or the ledger itself
// (agents can't import money code). payments-help/backend.ts fills it in on the server.
import type { OrderFacts, TransactionFacts } from "../paypal-toolkit/parse";

export type { OrderFacts, TransactionFacts };

/** One of the user's recent buys, from North's own record. */
export type PurchaseFact = {
  /** o1, o2… The model points at these; it never sees a PayPal id. */
  handle: string;
  name: string;
  imageUrl: string;
  amountCents: number;
  /** What North's record says. */
  status: "pending" | "paid" | "refunded" | "failed";
  at: string;
  /** False when no PayPal order was ever made (the buy never reached PayPal). */
  hasOrder: boolean;
};

export type OrderLookup =
  | { found: true; order: OrderFacts; /** The method name PayPal's toolkit was asked, for the activity panel. */ via: string }
  | { found: false; reason: "no_order" | "not_found" | "no_permission" | "unavailable"; via: string };

export type ActivityLookup = { ok: true; transactions: TransactionFacts[]; via: string } | { ok: false; reason: "no_permission" | "unavailable"; via: string };

export interface PaymentsBackend {
  /** Newest first, at most 8. */
  recentPurchases(): PurchaseFact[];
  /** Asks PayPal (through the Agent Toolkit) about the order behind one purchase. */
  lookupOrder(handle: string): Promise<OrderLookup>;
  /** Asks PayPal (through the Agent Toolkit) for the recent transactions. */
  lookupActivity(): Promise<ActivityLookup>;
}
