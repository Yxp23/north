// One-tap refund of a paid purchase. The capture id comes from our own record, never from the browser.
// A refund gives money back, so it doesn't need the Guardian's yes/no. It can only refund a buy we paid, once, for exactly
// what was paid. Like a charge, the PayPal call needs a signed, single-use statement (here: for this user, this purchase
// and its amount), so nothing else can send money out through the refund call.
import type { Signer } from "../guardian/approval";
import { APPROVAL_TTL_MS, signClaims } from "../guardian/signed";
import type { Ledger } from "../ledger/ledger";
import { addAudit, markRefunded } from "../ledger/logic";

export type RefundResult =
  | { ok: true; status: string }
  // `alreadyRefunded` = PayPal said CAPTURE_FULLY_REFUNDED.
  | { ok: false; error: string; alreadyRefunded?: boolean };

export interface RefundGateway {
  refund(args: {
    captureId: string;
    requestId: string;
    userId: string;
    purchaseId: string;
    amountCents: number;
    currency: string;
    /** Signed for exactly this refund (see guardian/signed.ts). The gateway refuses without a valid one. */
    approvalToken: string;
  }): Promise<RefundResult>;
}

export type RefundDeps = { userId: string; signer: Signer; ledger: Ledger; gateway: RefundGateway; now(): Date; newId(): string };

export type RefundOutcome =
  | { kind: "refunded" }
  | { kind: "already_refunded" }
  /** PayPal is still working on it. The webhook will update the screen. */
  | { kind: "pending" }
  | { kind: "not_found" }
  | { kind: "not_paid" }
  | { kind: "failed"; message: string };

export async function refundPurchase(purchaseId: string, deps: RefundDeps): Promise<RefundOutcome> {
  const data = await deps.ledger.read();
  const p = data.purchases.find((x) => x.id === purchaseId);
  if (!p) return { kind: "not_found" };
  if (p.status === "refunded") return { kind: "already_refunded" };
  if (p.status !== "paid") return { kind: "not_paid" };
  if (!p.captureId) return { kind: "failed", message: "I can't find the PayPal payment for this buy." };

  let result: RefundResult;
  try {
    const iat = deps.signer.now();
    const approvalToken = signClaims(
      {
        v: 1, kind: "refund", nonce: `refund-${p.id}-${deps.newId()}`, userId: deps.userId, ref: p.id,
        amountCents: p.amountCents, currency: p.currency, quantity: 1, iat, exp: iat + APPROVAL_TTL_MS,
      },
      deps.signer.key,
    );
    // The request id is the same on every tap, so PayPal can never refund twice.
    result = await deps.gateway.refund({
      captureId: p.captureId, requestId: `refund-${p.id}`, userId: deps.userId, purchaseId: p.id,
      amountCents: p.amountCents, currency: p.currency, approvalToken,
    });
  } catch {
    result = { ok: false, error: "Could not reach PayPal." };
  }

  const now = deps.now();
  return deps.ledger.update<RefundOutcome>((d) => {
    if (result.ok && result.status === "PENDING") {
      addAudit(d, "refund_pending", p.id, now);
      return { kind: "pending" };
    }
    if (result.ok || result.alreadyRefunded) {
      markRefunded(d, p.id, now);
      addAudit(d, "refund", `${p.id}${result.ok ? "" : " (PayPal said already refunded)"}`, now);
      return { kind: result.ok ? "refunded" : "already_refunded" };
    }
    addAudit(d, "refund_failed", `${p.id}: ${result.error}`, now);
    return { kind: "failed", message: "PayPal did not refund this. Please try again." };
  });
}
