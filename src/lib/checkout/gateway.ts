// The real PayPal charge. This file moves money, so it must only be reached through
// checkout.ts (which requires a Guardian approval). structure.test.ts enforces that.
//
// Even then it does not trust its caller: before PayPal is called it checks the signed Guardian approval (authorizeMoney)
// against the exact user, product, amount, currency and quantity, and spends the approval's one-time nonce. A missing,
// expired, reused, edited or mismatched approval means "no charge". The amount and currency PayPal receives come from
// the verified approval itself.
import "server-only";
import { authorizeMoney, type GuardianCrypto } from "../guardian/authorize";
import { captureOrder, createOrderWithVault, extractCaptureId } from "../paypal";
import type { PayGateway } from "./checkout";

export function createPaypalGateway(crypto: GuardianCrypto): PayGateway {
  return {
    async charge({ vaultId, userId, productId, amountCents, currency, quantity, customId, requestId, approvalToken }) {
      const auth = await authorizeMoney(approvalToken, { kind: "charge", userId, ref: productId, amountCents, currency, quantity }, crypto);
      if (!auth.ok) return { ok: false, error: `The Guardian's approval was not accepted (${auth.reason}). Nothing was charged.` };

      const created = await createOrderWithVault(vaultId, auth.verified, { customId, requestId });
      // A 5xx might mean PayPal did the work and we never heard. A 4xx means it said no.
      if (!created.ok) return { ok: false, error: `PayPal ${created.status}: ${JSON.stringify(created.body).slice(0, 300)}`, uncertain: created.status >= 500 };

      const status: string = created.body.status;
      if (status === "COMPLETED") {
        return { ok: true, orderId: created.body.id, captureId: extractCaptureId(created.body), status };
      }
      // Safety net: if PayPal ever returns an order that still needs a capture, capture it.
      if (status === "APPROVED" || status === "CREATED") {
        const cap = await captureOrder(created.body.id, auth.verified, `${requestId}-capture`);
        if (!cap.ok || cap.body?.status !== "COMPLETED") {
          return { ok: false, error: `capture failed: ${JSON.stringify(cap.body).slice(0, 300)}`, uncertain: !cap.ok && cap.status >= 500 };
        }
        return { ok: true, orderId: created.body.id, captureId: extractCaptureId(cap.body), status: "COMPLETED" };
      }
      return { ok: false, error: `unexpected order status ${status}` };
    },
  };
}

/**
 * PRACTICE payments, for development, tests and the attacker (`PAYMENTS_MODE=simulated`). It does everything the real gateway
 * does to decide whether a charge is allowed (it checks the signed Guardian approval, spends its one-time number, and uses
 * the approved amount), and then, instead of calling PayPal, pretends it worked. No network. It refuses to exist in production.
 */
export function createSimulatedGateway(crypto: GuardianCrypto): PayGateway {
  if (process.env.NODE_ENV === "production") throw new Error("Simulated payments are not available in production.");
  return {
    async charge({ userId, productId, amountCents, currency, quantity, customId, approvalToken }) {
      const auth = await authorizeMoney(approvalToken, { kind: "charge", userId, ref: productId, amountCents, currency, quantity }, crypto);
      if (!auth.ok) return { ok: false, error: `The Guardian's approval was not accepted (${auth.reason}). Nothing was charged.` };
      return { ok: true, orderId: `SIM-ORDER-${customId}`, captureId: `SIM-CAP-${customId}`, status: "COMPLETED" };
    },
  };
}
