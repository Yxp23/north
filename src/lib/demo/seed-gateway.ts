// Payments for the demo week ONLY. The judges' demo account is a practice account, so its seeded week is built with practice payments: each
// "charge" checks the very same signed, single-use Guardian approval the real PayPal gateway checks (exact user, item, amount, currency,
// quantity; the nonce is spent), and then, instead of calling PayPal, records an order whose id starts with DEMO-. Receipts therefore show
// DEMO-ORDER-... ids: nothing here pretends to be a PayPal payment.
//
// It can only be created by seed-week.ts, which refuses to run for anyone but the practice account, and no route reaches it directly.
import { authorizeMoney, type GuardianCrypto } from "../guardian/authorize";
import type { PayGateway } from "../checkout/checkout";
import type { RefundGateway } from "../refund/refund";

export function createSeedGateway(crypto: GuardianCrypto): PayGateway {
  return {
    async charge({ userId, productId, amountCents, currency, quantity, customId, approvalToken }) {
      const auth = await authorizeMoney(approvalToken, { kind: "charge", userId, ref: productId, amountCents, currency, quantity }, crypto);
      if (!auth.ok) return { ok: false, error: `The Guardian's approval was not accepted (${auth.reason}). Nothing was charged.` };
      return { ok: true, orderId: `DEMO-ORDER-${customId}`, captureId: `DEMO-CAP-${customId}`, status: "COMPLETED" };
    },
  };
}

export function createSeedRefundGateway(crypto: GuardianCrypto): RefundGateway {
  return {
    async refund({ userId, purchaseId, amountCents, currency, approvalToken }) {
      const auth = await authorizeMoney(approvalToken, { kind: "refund", userId, ref: purchaseId, amountCents, currency, quantity: 1 }, crypto);
      if (!auth.ok) return { ok: false, error: `The refund was not accepted (${auth.reason}).` };
      return { ok: true, status: "COMPLETED" };
    },
  };
}
