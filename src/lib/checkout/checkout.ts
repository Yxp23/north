// Guarded checkout: product -> Guardian decides -> approve charges the saved PayPal.
//
// The charge step runs only inside `withApproval`, so it can't run without a real Guardian
// approval (see guardian/approval.ts). The price always comes from the store, never from the caller.
// Money is reserved (a "pending" buy) in the same locked step as the decision, so two quick taps
// can't both spend the same money.
import { requestApproval, withApproval, type Approval, type GuardianResult } from "../guardian";
import type { Ledger } from "../ledger/ledger";
import { addAudit, buildUserState, markPaid } from "../ledger/logic";
import type { PurchaseRecord, PurchaseView } from "../ledger/types";
import type { StoreProvider } from "../store";

export type ChargeArgs = {
  vaultId: string;
  amountCents: number;
  currency: string;
  /** Our purchase id. PayPal sends it back on the webhook so we can match the payment. */
  customId: string;
  /** Becomes the PayPal-Request-Id, so a retry can never charge twice. */
  requestId: string;
};
export type ChargeResult =
  | { ok: true; orderId: string; captureId?: string; status: string }
  // `uncertain` = we lost contact, so PayPal may or may not have taken the money.
  | { ok: false; error: string; uncertain?: boolean };

/** The part that talks to PayPal. Real one: checkout/gateway.ts. Tests use a fake. */
export interface PayGateway {
  charge(args: ChargeArgs): Promise<ChargeResult>;
}

export type CheckoutDeps = {
  ledger: Ledger;
  store: StoreProvider;
  gateway: PayGateway;
  getVaultId(): Promise<string | null>;
  now(): Date;
  newId(): string;
};

export type CheckoutInput = {
  productId: string;
  /** One per tap on Buy. */
  attemptId: string;
  /** The user tapped "Buy now" on a wait screen. */
  overrideWait?: boolean;
  /** Demo clock. Normally the real time. */
  at?: Date;
};

export type CheckoutOutcome =
  | { kind: "paid"; purchase: PurchaseView; result?: GuardianResult }
  | { kind: "wait"; result: GuardianResult }
  | { kind: "refused"; result: GuardianResult }
  | { kind: "needs_paypal"; result: GuardianResult }
  | { kind: "failed"; message: string; purchase?: PurchaseView }
  | { kind: "in_progress" }
  | { kind: "not_found" };

const view = (p: PurchaseRecord): PurchaseView => ({
  id: p.id, name: p.name, imageUrl: p.imageUrl, amountCents: p.amountCents, status: p.status, at: p.createdAt,
});

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Gate = { early: CheckoutOutcome } | { approval: Approval; purchaseId: string };

export async function checkout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutOutcome> {
  const product = await deps.store.getProduct(input.productId);
  if (!product) return { kind: "not_found" };

  const vaultId = await deps.getVaultId();
  const now = deps.now();
  const at = input.at ?? now;

  // Step 1 (locked): the Guardian decides, and an approved buy reserves its money right away.
  const gate = await deps.ledger.update<Gate>((data) => {
    const existing = data.purchases.find((p) => p.attemptId === input.attemptId);
    if (existing) {
      if (existing.status === "paid") return { early: { kind: "paid", purchase: view(existing) } };
      if (existing.status === "pending") return { early: { kind: "in_progress" } };
      return { early: { kind: "failed", message: existing.failureReason ?? "That did not go through.", purchase: view(existing) } };
    }

    const { result, approval } = requestApproval(
      { amountCents: product.priceCents, item: product.name, category: product.category, at, overrideWait: input.overrideWait },
      buildUserState(data, now),
    );
    addAudit(data, "decision", `${product.name} ${dollars(product.priceCents)}: ${result.decision} (${result.code})`, now);

    if (!approval) {
      return { early: result.decision === "wait" ? { kind: "wait", result } : { kind: "refused", result } };
    }
    if (!vaultId) {
      addAudit(data, "needs_paypal", "approved, but no saved PayPal", now);
      return { early: { kind: "needs_paypal", result } };
    }

    const purchaseId = deps.newId();
    data.purchases.push({
      id: purchaseId, attemptId: input.attemptId, productId: product.id, name: product.name, category: product.category,
      imageUrl: product.imageUrl, amountCents: product.priceCents, currency: product.currency, status: "pending",
      createdAt: now.toISOString(), overrodeWait: result.overridden, decisionCode: result.code,
    });
    return { approval, purchaseId };
  });

  if ("early" in gate) return gate.early;

  // Step 2: the charge. Only runs for a real, unused approval, and charges the approved amount.
  let charged: Awaited<ReturnType<PayGateway["charge"]>>;
  try {
    charged = await withApproval(gate.approval, (approved) =>
      deps.gateway.charge({
        vaultId: vaultId!,
        amountCents: approved.amountCents,
        currency: product.currency,
        customId: gate.purchaseId,
        requestId: input.attemptId,
      }),
    );
  } catch (e) {
    charged = { ok: false, error: e instanceof Error ? e.message : "Could not reach PayPal.", uncertain: true };
  }

  // Step 3 (locked): record what happened.
  return deps.ledger.update<CheckoutOutcome>((data) => {
    const p = data.purchases.find((x) => x.id === gate.purchaseId)!;
    if (charged.ok) {
      markPaid(data, p.id, { captureId: charged.captureId, orderId: charged.orderId, via: "checkout" }, now);
      addAudit(data, "paid", `${p.id} ${dollars(p.amountCents)} (${charged.status})`, now);
      return { kind: "paid", purchase: view(p) };
    }
    // A webhook may already have told us it was paid. Don't undo that.
    if (p.status === "pending") {
      p.status = "failed";
      p.failureReason = charged.error;
    }
    addAudit(data, "charge_failed", `${p.id}: ${charged.error}`, now);
    return p.status === "paid"
      ? { kind: "paid", purchase: view(p) }
      : {
          kind: "failed",
          message: charged.uncertain
            ? "I could not confirm the payment. If PayPal took the money, it will show up here soon."
            : "PayPal did not take the payment. No money was spent.",
          purchase: view(p),
        };
  });
}
