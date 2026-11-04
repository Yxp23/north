import "server-only";
import { getLedger } from "../ledger/server";
import { refundCapture } from "../paypal";
import { refundPurchase, type RefundOutcome } from "./refund";

export function runRefund(purchaseId: string): Promise<RefundOutcome> {
  return refundPurchase(purchaseId, {
    ledger: getLedger(),
    now: () => new Date(),
    gateway: {
      async refund({ captureId, requestId }) {
        const r = await refundCapture(captureId, requestId);
        if (r.ok) return { ok: true, status: String(r.body?.status ?? "COMPLETED") };
        // PayPal answers 422 with issue CAPTURE_FULLY_REFUNDED when it was already refunded.
        const already = JSON.stringify(r.body ?? "").includes("CAPTURE_FULLY_REFUNDED");
        return { ok: false, alreadyRefunded: already, error: `PayPal ${r.status}` };
      },
    },
  });
}
