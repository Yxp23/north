import "server-only";
import { randomUUID } from "node:crypto";
import { authorizeMoney } from "../guardian/authorize";
import { guardianCrypto } from "../checkout/run";
import { getLedger } from "../ledger/server";
import { refundCapture } from "../paypal";
import { refundPurchase, type RefundOutcome } from "./refund";

export function runRefund(userId: string, purchaseId: string): Promise<RefundOutcome> {
  const crypto = guardianCrypto();
  return refundPurchase(purchaseId, {
    userId,
    signer: { key: crypto.key, now: crypto.now },
    ledger: getLedger(userId),
    now: () => new Date(),
    newId: () => randomUUID(),
    gateway: {
      async refund({ captureId, requestId, userId: uid, purchaseId: pid, amountCents, currency, approvalToken }) {
        // The refund call itself verifies a signed, single-use statement for exactly this refund.
        const auth = await authorizeMoney(approvalToken, { kind: "refund", userId: uid, ref: pid, amountCents, currency, quantity: 1 }, crypto);
        if (!auth.ok) return { ok: false, error: `The refund was not accepted (${auth.reason}).` };
        const r = await refundCapture(captureId, auth.verified, requestId);
        if (r.ok) return { ok: true, status: String(r.body?.status ?? "COMPLETED") };
        // PayPal answers 422 with issue CAPTURE_FULLY_REFUNDED when it was already refunded.
        const already = JSON.stringify(r.body ?? "").includes("CAPTURE_FULLY_REFUNDED");
        return { ok: false, alreadyRefunded: already, error: `PayPal ${r.status}` };
      },
    },
  });
}
