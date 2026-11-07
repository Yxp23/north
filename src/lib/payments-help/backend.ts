// Fills the payments helper's backend: our own record of the user's buys (read only), and PayPal's answers through
// the Agent Toolkit. It can only look. It has no way to charge, refund or change anything.
import type { PurchaseRecord } from "../ledger/types";
import { parseOrder, parseTransactions } from "../paypal-toolkit/parse";
import type { ActivityLookup, OrderLookup, PaymentsBackend, PurchaseFact } from "./types";

type Call = (method: string, args: Record<string, unknown>) => Promise<{ ok: boolean; text: string }>;
const MAX = 8;

export function createPaymentsBackend(opts: { purchases: PurchaseRecord[]; call: Call }): PaymentsBackend {
  const recent = [...opts.purchases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX);
  const facts: PurchaseFact[] = recent.map((p, i) => ({
    handle: `o${i + 1}`, name: p.name, imageUrl: p.imageUrl, amountCents: p.amountCents, status: p.status, at: p.createdAt, hasOrder: Boolean(p.paypalOrderId),
  }));
  // The PayPal order ids stay here. The model only ever gets handles.
  const orderIds = new Map(recent.map((p, i) => [`o${i + 1}`, p.paypalOrderId]));

  return {
    recentPurchases: () => facts,

    async lookupOrder(handle): Promise<OrderLookup> {
      const orderId = orderIds.get(handle);
      if (!orderId) return { found: false, reason: "no_order", via: "get_order" };
      const r = await opts.call("get_order", { id: orderId });
      const parsed = parseOrder(r.text);
      return parsed.ok ? { found: true, order: parsed.order, via: "get_order" } : { found: false, reason: parsed.reason, via: "get_order" };
    },

    async lookupActivity(): Promise<ActivityLookup> {
      const r = await opts.call("list_transactions", {});
      const parsed = parseTransactions(r.text);
      if (parsed.ok) return { ok: true, transactions: parsed.transactions.slice(0, MAX), via: "list_transactions" };
      return { ok: false, reason: parsed.reason === "no_permission" ? "no_permission" : "unavailable", via: "list_transactions" };
    },
  };
}
