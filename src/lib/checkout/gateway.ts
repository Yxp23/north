// The real PayPal charge. This file moves money, so it must only be reached through
// checkout.ts (which requires a Guardian approval). structure.test.ts enforces that.
import "server-only";
import { captureOrder, createOrderWithVault, extractCaptureId } from "../paypal";
import type { PayGateway } from "./checkout";

export const paypalGateway: PayGateway = {
  async charge({ vaultId, amountCents, customId, requestId }) {
    const created = await createOrderWithVault(vaultId, (amountCents / 100).toFixed(2), { customId, requestId });
    if (!created.ok) return { ok: false, error: `PayPal ${created.status}: ${JSON.stringify(created.body).slice(0, 300)}` };

    const status: string = created.body.status;
    if (status === "COMPLETED") {
      return { ok: true, orderId: created.body.id, captureId: extractCaptureId(created.body), status };
    }
    // Safety net: if PayPal ever returns an order that still needs a capture, capture it.
    if (status === "APPROVED" || status === "CREATED") {
      const cap = await captureOrder(created.body.id, `${requestId}-capture`);
      if (!cap.ok || cap.body?.status !== "COMPLETED") {
        return { ok: false, error: `capture failed: ${JSON.stringify(cap.body).slice(0, 300)}` };
      }
      return { ok: true, orderId: created.body.id, captureId: extractCaptureId(cap.body), status: "COMPLETED" };
    }
    return { ok: false, error: `unexpected order status ${status}` };
  },
};
