// Guarded checkout: product -> Guardian decides -> approve charges the saved PayPal.
//
// The charge step runs only inside `withApproval`, so it can't run without a real Guardian
// approval (see guardian/approval.ts). The price always comes from the store, never from the caller.
// Money is reserved (a "pending" buy) in the same locked step as the decision, so two quick taps
// can't both spend the same money.
import { requestApproval, withApproval, type Approval, type GuardianResult, type RuleId } from "../guardian";
import type { Ledger } from "../ledger/ledger";
import { activeWaiting, addAudit, buildUserState, isSellerFlagged, markPaid, summarize, waitingView } from "../ledger/logic";
import type { PurchaseRecord, PurchaseView, WaitingView } from "../ledger/types";
import type { StoreProvider } from "../store";
import type { StepEvent } from "../agents/loop"; // a type only: erased when building, so checkout imports no agent code

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
  /** Plain-word steps for the activity panel ("Asking the Money Guardian…"). Optional. */
  onStep?(event: StepEvent): void;
};

export type CheckoutInput = {
  productId: string;
  /** One per tap on Buy. */
  attemptId: string;
  /** The user tapped "Buy now" on a wait screen. */
  overrideWait?: boolean;
  /** Demo clock. Normally the real time. */
  at?: Date;
  /**
   * The price the user saw on screen. Only ever used to STOP a buy: if the live price is different, nothing is
   * charged and the user looks again. It never sets the price, and can't approve anything.
   */
  seenCents?: number;
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
  | { kind: "failed"; message: string; purchase?: PurchaseView }
  | { kind: "in_progress" }
  | { kind: "not_found" };

const view = (p: PurchaseRecord): PurchaseView => ({
  id: p.id, name: p.name, imageUrl: p.imageUrl, amountCents: p.amountCents, status: p.status, at: p.createdAt,
});

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

  const vaultId = await deps.getVaultId();
  const now = deps.now();
  const at = input.at ?? now;

  // Step 1 (locked): the Guardian decides, and an approved buy reserves its money right away.
  working("Asking the Money Guardian…");
  const gate = await deps.ledger.update<Gate>((data) => {
    const existing = data.purchases.find((p) => p.attemptId === input.attemptId);
    if (existing) {
      if (existing.status === "paid") return { early: { kind: "paid", purchase: view(existing), leftCents: summarize(data, now).leftCents } };
      if (existing.status === "pending") return { early: { kind: "in_progress" } };
      return { early: { kind: "failed", message: existing.failureReason ?? "That did not go through.", purchase: view(existing) } };
    }

    // Was this product saved on the waiting list earlier? Then its wait counts (from OUR record, never the browser).
    const waiting = activeWaiting(data, product.id);

    const { result, approval } = requestApproval(
      {
        amountCents: product.priceCents, item: product.name, category: product.category, at, overrideWait: input.overrideWait,
        waitlist: waiting ? { since: new Date(waiting.createdAt), waitHours: waiting.waitHours } : undefined,
        // A seller the scam checker flagged can't be paid: the Guardian's hard wall refuses. The list is OUR record.
        sellerFlaggedScam: isSellerFlagged(data, product.sellerDomain),
      },
      buildUserState(data, now),
    );
    addAudit(data, "decision", `${product.name} ${dollars(product.priceCents)}: ${result.decision} (${result.code})`, now);

    if (!approval) {
      if (result.decision === "waitlist") {
        // Firm rule: save it (once), don't charge. If it is already saved, say when it will be ready.
        let item = waiting;
        if (!item) {
          item = {
            id: `wait_${deps.newId().replace(/^pur_/, "")}`, productId: product.id, name: product.name, category: product.category,
            imageUrl: product.imageUrl, amountCents: product.priceCents, currency: product.currency,
            createdAt: at.toISOString(), // the same clock the Guardian used, so the wait is measured on it (the real time, outside demo mode)
            remindAt: (result.remindAt ?? now).toISOString(), waitHours: result.waitHours ?? 24, rules: result.triggered, status: "waiting",
          };
          data.waitingList.push(item);
          addAudit(data, "waitlisted", `${product.name} ${dollars(product.priceCents)}: saved, remind ${item.remindAt}`, now);
        }
        return { early: { kind: "waitlisted", result, item: waitingView(item, now) } };
      }
      return { early: result.decision === "wait" ? { kind: "wait", result } : { kind: "refused", result } };
    }
    if (!vaultId) {
      addAudit(data, "needs_paypal", "approved, but no saved PayPal", now);
      return { early: { kind: "needs_paypal", result } };
    }

    // Every "Buy now" is logged: what, how much, which rule. (The home screen counts these.)
    if (result.overridden) {
      addAudit(data, "override", `Buy now: ${product.name}, ${dollars(product.priceCents)}, ${ruleList(result.overriddenRules)}`, now);
    }

    const purchaseId = deps.newId();
    data.purchases.push({
      id: purchaseId, attemptId: input.attemptId, productId: product.id, name: product.name, category: product.category,
      imageUrl: product.imageUrl, amountCents: product.priceCents, currency: product.currency, status: "pending",
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
    return early;
  }
  finished("Asking the Money Guardian…", `Money Guardian: ${gate.approval.result.decision} (${gate.approval.result.code}). ${gate.approval.result.reason}`);

  // Step 2: the charge. Only runs for a real, unused approval, and charges the approved amount.
  working("Charging your saved PayPal…");
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
