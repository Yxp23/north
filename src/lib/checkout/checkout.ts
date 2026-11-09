// Guarded checkout: product -> Guardian decides -> approve charges the saved PayPal.
//
// The charge step runs only inside `withApproval`, so it can't run without a real Guardian
// approval (see guardian/approval.ts). The price always comes from the store, never from the caller.
// Money is reserved (a "pending" buy) in the same locked step as the decision, so two quick taps
// can't both spend the same money.
import { NotApprovedError, requestApproval, withApproval, type Approval, type GuardianResult, type RuleId, type Signer } from "../guardian";
import type { Ledger } from "../ledger/ledger";
import { activeWaiting, addAudit, buildUserState, isSellerFlagged, markPaid, summarize, waitingView } from "../ledger/logic";
import type { PurchaseRecord, PurchaseView, WaitingView } from "../ledger/types";
import type { StoreProvider } from "../store";
import type { StepEvent } from "../agents/loop"; // a type only: erased when building, so checkout imports no agent code

export type ChargeArgs = {
  vaultId: string;
  /** Who is paying and for what. The gateway checks the signed approval is for exactly this. */
  userId: string;
  productId: string;
  quantity: number;
  /** The Guardian's signed, single-use approval (see guardian/signed.ts). The gateway refuses without a valid one. */
  approvalToken: string;
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
  /** Whose money this is (the logged-in person). It is signed into the Guardian's approval. */
  userId: string;
  /** Signs the Guardian's approvals (see guardian/secret.ts). */
  signer: Signer;
  ledger: Ledger;
  store: StoreProvider;
  gateway: PayGateway;
  getVaultId(): Promise<string | null>;
  now(): Date;
  newId(): string;
  /** Plain-word steps for the activity panel ("Asking the Money Guardian…"). Optional. */
  onStep?(event: StepEvent): void;
};

export type CheckoutInput = {
  productId: string;
  /** One per tap on Buy. */
  attemptId: string;
  /** The user tapped "Buy now" on a wait screen. */
  overrideWait?: boolean;
  /**
   * Demo tools only: "pretend it is this hour (0-23)". It changes ONLY which hour the late-night rule sees. It never moves
   * the clock the one-day rule delay, the wait timers and "this week" use (those always use the real time), so it can't
   * be used to make a loosened rule count early. The route allows it only when demo tools are on.
   */
  pretendHour?: number;
  /** How many to buy, 1 to 5. The Guardian and PayPal see the total (store price times this). Default 1. */
  quantity?: number;
  /**
   * The price the user saw on screen. Only ever used to STOP a buy: if the live price is different, nothing is
   * charged and the user looks again. It never sets the price, and can't approve anything.
   */
  seenCents?: number;
  /**
   * The caller may SAVE a buy to the waiting list but must never cause a charge (the assistant checkpoint uses this when it
   * only means to save). If the Guardian would approve, nothing is charged and the outcome is "not_charged".
   */
  neverCharge?: boolean;
};

export type CheckoutOutcome =
  /** `leftCents`: what the user still has to spend this week, after this buy. */
  | { kind: "paid"; purchase: PurchaseView; result?: GuardianResult; leftCents: number }
  /** The live price is not the one the user saw. Nothing was charged. */
  | { kind: "price_changed"; name: string; seenCents: number; nowCents: number }
  /** Gentle rule: Wait, or buy now? */
  | { kind: "wait"; result: GuardianResult }
  /** Firm rule: saved on the waiting list. No Buy now. */
  | { kind: "waitlisted"; result: GuardianResult; item: WaitingView }
  /** A hard wall or a locked rule. Never an override. */
  | { kind: "refused"; result: GuardianResult }
  | { kind: "needs_paypal"; result: GuardianResult }
  /** `neverCharge` was set and the Guardian would approve. Nothing was charged. */
  | { kind: "not_charged"; result: GuardianResult }
  | { kind: "failed"; message: string; purchase?: PurchaseView }
  | { kind: "in_progress" }
  | { kind: "not_found" };

const view = (p: PurchaseRecord): PurchaseView => ({
  id: p.id, name: p.name, imageUrl: p.imageUrl, amountCents: p.amountCents, status: p.status, at: p.createdAt,
  ...(p.paypalOrderId ? { paypalOrderId: p.paypalOrderId } : {}), ...(p.captureId ? { paypalCaptureId: p.captureId } : {}),
});

export const MAX_QUANTITY = 5;

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const RULE_LABEL: Record<RuleId, string> = { big_buy: "wait on big buys", late_night: "wait on late-night buys" };
const ruleList = (ids: RuleId[]) => `${ids.length > 1 ? "rules" : "rule"}: ${ids.map((id) => `${RULE_LABEL[id]} (${id})`).join(", ")}`;

type Gate = { early: CheckoutOutcome } | { approval: Approval; purchaseId: string; waitingId?: string };

export async function checkout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutOutcome> {
  const outcome = await guardedCheckout(input, deps);
  deps.onStep?.({ label: "Done.", state: "done" });
  return outcome;
}

async function guardedCheckout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutOutcome> {
  // Steps are plain words that WE write. A step is "working" until its work is done.
  const working = (label: string) => deps.onStep?.({ label, state: "working" });
  const finished = (label: string, detail?: string) => deps.onStep?.({ label, state: "done", ...(detail ? { detail } : {}) });
  const said = (label: string, warn = false) => deps.onStep?.({ label, state: "done", ...(warn ? { warn: true } : {}) });

  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return { kind: "failed", message: "That quantity is not allowed." };
  if (input.pretendHour !== undefined && !(Number.isInteger(input.pretendHour) && input.pretendHour >= 0 && input.pretendHour <= 23)) {
    return { kind: "failed", message: "That time is not allowed." };
  }

  working("Looking up the price…");
  // A fresh read from the live store: the price is never a cached one, and never from the browser or a model.
  const product = await deps.store.getProduct(input.productId, { fresh: true });
  if (!product) {
    finished("Looking up the price…", "The store does not have that product.");
    return { kind: "not_found" };
  }
  finished(
    "Looking up the price…",
    `${product.name} is ${dollars(product.priceCents)}. ${product.live === false ? "This is the saved price: I could not reach the store just now." : "The price comes from the store, never from the browser."}`,
  );
  if (typeof input.seenCents === "number" && input.seenCents !== product.priceCents) {
    said(`The price changed from ${dollars(input.seenCents)} to ${dollars(product.priceCents)}. I did not buy it.`, true);
    return { kind: "price_changed", name: product.name, seenCents: input.seenCents, nowCents: product.priceCents };
  }

  // North's money (budget, protected money) is in US dollars, and so is the PayPal order. Anything else is refused.
  if (product.currency !== "USD") {
    said("North can only buy in US dollars. I did not buy it.", true);
    return { kind: "failed", message: "North can only buy things priced in US dollars." };
  }

  // The Guardian and PayPal see the TOTAL. The price on screen (seenCents) is the price of one.
  const amountCents = product.priceCents * quantity;
  if (!Number.isSafeInteger(amountCents)) return { kind: "failed", message: "I can't read that price, so I can't buy it." };
  const label = quantity > 1 ? `${product.name} × ${quantity}` : product.name;
  const vaultId = await deps.getVaultId();
  const now = deps.now();
  const at = now; // always the real time: see pretendHour

  // Step 1 (locked): the Guardian decides, and an approved buy reserves its money right away.
  working("Asking the Money Guardian…");
  const gate = await deps.ledger.update<Gate>((data) => {
    const existing = data.purchases.find((p) => p.attemptId === input.attemptId);
    if (existing) {
      // A tap id belongs to ONE product. Using it again for another is a mistake or an attack: say no, never reuse the answer.
      if (existing.productId !== product.id) {
        addAudit(data, "attempt_reuse", `Attempt ${input.attemptId} was used again for a different product. Refused.`, now);
        return { early: { kind: "failed", message: "That tap was already used for something else. Please try again." } };
      }
      if (existing.status === "paid") return { early: { kind: "paid", purchase: view(existing), leftCents: summarize(data, now).leftCents } };
      if (existing.status === "pending") return { early: { kind: "in_progress" } };
      return { early: { kind: "failed", message: existing.failureReason ?? "That did not go through.", purchase: view(existing) } };
    }

    // Was this product saved on the waiting list earlier? Then its wait counts (from OUR record, never the browser).
    const waiting = activeWaiting(data, product.id);
    // A saved item's wait was served for the amount that was SAVED. Asking for more (a bigger quantity, a higher price) is a
    // different buy: it must be saved again, not slipped through on the old wait.
    if (waiting && amountCents > waiting.amountCents) {
      addAudit(data, "waitlist_amount_grew", `${label} ${dollars(amountCents)} is more than the ${dollars(waiting.amountCents)} that was saved. Refused.`, now);
      return { early: { kind: "failed", message: "That is more than the amount you saved. Please ask again for what you saved." } };
    }

    const purchaseId = deps.newId(); // also the approval's one-time number, so it can be spent once
    const { result, approval } = requestApproval(
      {
        amountCents, item: label, category: product.category, at, overrideWait: input.overrideWait, hourOverride: input.pretendHour,
        waitlist: waiting ? { since: new Date(waiting.createdAt), waitHours: waiting.waitHours } : undefined,
        // A seller the scam checker flagged can't be paid: the Guardian's hard wall refuses. The list is OUR record.
        sellerFlaggedScam: isSellerFlagged(data, product.sellerDomain),
      },
      buildUserState(data, now),
      { userId: deps.userId, productId: product.id, currency: product.currency, quantity, nonce: purchaseId },
      deps.signer,
    );
    addAudit(data, "decision", `${label} ${dollars(amountCents)}: ${result.decision} (${result.code})`, now);

    if (!approval) {
      if (result.decision === "waitlist") {
        // Firm rule: save it (once), don't charge. If it is already saved, say when it will be ready.
        let item = waiting;
        if (!item) {
          item = {
            id: `wait_${purchaseId.replace(/^pur_/, "")}`, productId: product.id, name: label, category: product.category,
            imageUrl: product.imageUrl, amountCents, currency: product.currency,
            createdAt: at.toISOString(), // the same clock the Guardian used, so the wait is measured on it (the real time, outside demo mode)
            remindAt: (result.remindAt ?? now).toISOString(), waitHours: result.waitHours ?? 24, rules: result.triggered, status: "waiting",
          };
          data.waitingList.push(item);
          addAudit(data, "waitlisted", `${label} ${dollars(amountCents)}: saved, remind ${item.remindAt}`, now);
        }
        return { early: { kind: "waitlisted", result, item: waitingView(item, now) } };
      }
      return { early: result.decision === "wait" ? { kind: "wait", result } : { kind: "refused", result } };
    }
    if (input.neverCharge) return { early: { kind: "not_charged", result } };
    if (!vaultId) {
      addAudit(data, "needs_paypal", "approved, but no saved PayPal", now);
      return { early: { kind: "needs_paypal", result } };
    }

    // Every "Buy now" is logged: what, how much, which rule. (The home screen counts these.)
    if (result.overridden) {
      addAudit(data, "override", `Buy now: ${label}, ${dollars(amountCents)}, ${ruleList(result.overriddenRules)}`, now);
    }

    data.purchases.push({
      id: purchaseId, attemptId: input.attemptId, productId: product.id, name: label, category: product.category,
      imageUrl: product.imageUrl, amountCents, currency: product.currency, status: "pending",
      createdAt: now.toISOString(), overrodeWait: result.overridden, decisionCode: result.code,
    });
    // Claim the waiting-list item right away, so a second tap can't buy it twice.
    if (waiting) {
      waiting.status = "bought";
      waiting.purchaseId = purchaseId;
    }
    return { approval, purchaseId, waitingId: waiting?.id };
  });

  // Tell the panel what the Guardian said. (The reason is the Guardian's own plain words.)
  if ("early" in gate) {
    const early = gate.early;
    const answer = "result" in early ? early.result : null;
    finished("Asking the Money Guardian…", answer ? `Money Guardian: ${answer.decision} (${answer.code}). ${answer.reason}` : "I already handled this tap.");
    if (early.kind === "refused") said(`The Money Guardian said no: ${early.result.reason}`, true);
    else if (early.kind === "wait") said("The Money Guardian says wait.");
    else if (early.kind === "waitlisted") said("The Money Guardian saved it for later.");
    else if (early.kind === "needs_paypal") said("Connect PayPal first.");
    else if (early.kind === "not_charged") said("Nothing was charged: this ask is only for saving.");
    return early;
  }
  finished("Asking the Money Guardian…", `Money Guardian: ${gate.approval.result.decision} (${gate.approval.result.code}). ${gate.approval.result.reason}`);

  // Step 2: the charge. Only runs for a real, unused approval, and charges the approved amount.
  working("Charging your saved PayPal…");
  let charged: Awaited<ReturnType<PayGateway["charge"]>>;
  try {
    charged = await withApproval(gate.approval, (approved, approvalToken) =>
      deps.gateway.charge({
        vaultId: vaultId!,
        userId: deps.userId,
        productId: product.id,
        quantity,
        approvalToken,
        amountCents: approved.amountCents,
        currency: product.currency,
        customId: gate.purchaseId,
        requestId: input.attemptId,
      }),
    );
  } catch (e) {
    // A refused approval means PayPal was never called. Anything else (we lost contact) might have charged: we can't tell.
    charged = e instanceof NotApprovedError
      ? { ok: false, error: "The Guardian's approval was not accepted. Nothing was charged." }
      : { ok: false, error: e instanceof Error ? e.message : "Could not reach PayPal.", uncertain: true };
  }

  finished("Charging your saved PayPal…", charged.ok ? `PayPal said ${charged.status}.` : "PayPal did not take the payment.");

  // Step 3 (locked): record what happened.
  working("Saving your receipt…");
  const recorded = await deps.ledger.update<CheckoutOutcome>((data) => {
    const p = data.purchases.find((x) => x.id === gate.purchaseId)!;
    if (charged.ok) {
      markPaid(data, p.id, { captureId: charged.captureId, orderId: charged.orderId, via: "checkout" }, now);
      addAudit(data, "paid", `${p.id} ${dollars(p.amountCents)} (${charged.status})`, now);
      return { kind: "paid", purchase: view(p), leftCents: summarize(data, now).leftCents };
    }
    // We lost contact, so PayPal may have taken the money. FAIL CLOSED: the buy stays "pending", which still counts
    // against the budget, until PayPal's webhook (or a person at PayPal) settles it. The same tap can't charge again.
    if (charged.uncertain && p.status === "pending") {
      p.failureReason = charged.error;
      addAudit(data, "charge_uncertain", `${p.id}: ${charged.error}`, now);
      return {
        kind: "failed",
        message: "I could not confirm the payment. If PayPal took the money, it will show up here soon.",
        purchase: view(p),
      };
    }
    // A webhook may already have told us it was paid. Don't undo that.
    if (p.status === "pending") {
      p.status = "failed";
      p.failureReason = charged.error;
      // The charge failed, so the saved item goes back on the waiting list.
      const w = data.waitingList.find((x) => x.id === gate.waitingId);
      if (w && w.purchaseId === p.id) {
        w.status = "waiting";
        w.purchaseId = undefined;
      }
    }
    addAudit(data, "charge_failed", `${p.id}: ${charged.error}`, now);
    return p.status === "paid"
      ? { kind: "paid", purchase: view(p), leftCents: summarize(data, now).leftCents }
      : {
          kind: "failed",
          message: charged.uncertain
            ? "I could not confirm the payment. If PayPal took the money, it will show up here soon."
            : "PayPal did not take the payment. No money was spent.",
          purchase: view(p),
        };
  });
  finished("Saving your receipt…");
  return recorded;
}
