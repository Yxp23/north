// The only door to the charge step.
//
// `requestApproval` runs the Guardian and, only on "approve", hands back an Approval: the Guardian's answer plus a
// SIGNED statement (see signed.ts) bound to this user, item, exact amount, currency and quantity, good for a couple of
// minutes and one use. `withApproval` is the only way to run code that moves money: it checks the Approval was really
// issued here, burns it, and passes the *approved* purchase and the signed statement to the charge function. The PayPal
// money calls then verify the statement again (guardian/authorize.ts) and spend its nonce in the database.
// A forged or copied object, a second use, or a statement that does not match, charges nothing.
import { decide } from "./guardian";
import { APPROVAL_TTL_MS, signClaims } from "./signed";
import type { DecisionCode, GuardianResult, Purchase, UserState } from "./types";

declare const approvalBrand: unique symbol;

/** Proof that the Guardian approved a purchase. Can't be built by hand (see `issued`). */
export type Approval = {
  readonly [approvalBrand]: true;
  readonly purchase: Readonly<Purchase>;
  readonly result: GuardianResult;
  /** The signed statement the PayPal charge needs. Meaningless without the server's secret. */
  readonly token: string;
};

/** What the approval is for. The statement is signed over exactly this. */
export type ApprovalBinding = {
  userId: string;
  productId: string;
  currency: string;
  quantity: number;
  /** Unique per approval (our purchase id). It can be spent once. */
  nonce: string;
};

export type Signer = { key: Buffer; now(): number };

export class NotApprovedError extends Error {
  constructor() {
    super("No Guardian approval for this purchase.");
    this.name = "NotApprovedError";
  }
}

// Real approvals only, keyed by object identity. A copy or look-alike is not in here.
// The value is a private frozen copy of the purchase, so later edits can't change the amount.
const issued = new WeakMap<object, { purchase: Readonly<Purchase>; token: string }>();

const CANT_SIGN: GuardianResult = {
  decision: "refuse", code: "bad_input" satisfies DecisionCode, reason: "Something is wrong on my end, so I can't buy this.",
  canOverride: false, overridden: false, overriddenRules: [], triggered: [],
};

export function requestApproval(
  purchase: Purchase,
  state: UserState,
  binding: ApprovalBinding,
  signer: Signer,
): { result: GuardianResult; approval: Approval | null } {
  const result = decide(purchase, state);
  if (result.decision !== "approve") return { result, approval: null };

  const approved = Object.freeze({ ...purchase, at: new Date(purchase.at.getTime()) });
  let token: string;
  try {
    const iat = signer.now();
    token = signClaims(
      {
        v: 1, kind: "charge", nonce: binding.nonce, userId: binding.userId, ref: binding.productId,
        amountCents: approved.amountCents, currency: binding.currency, quantity: binding.quantity, iat, exp: iat + APPROVAL_TTL_MS,
      },
      signer.key,
    );
  } catch {
    return { result: CANT_SIGN, approval: null }; // if we can't sign it, we can't pay: fail closed
  }
  const approval = Object.freeze({ purchase: approved, result, token }) as unknown as Approval;
  issued.set(approval, { purchase: approved, token });
  return { result, approval };
}

/** Runs `charge` only for a real, unused approval. */
export async function withApproval<T>(
  approval: Approval,
  charge: (purchase: Readonly<Purchase>, token: string) => Promise<T>,
): Promise<T> {
  const found = approval && typeof approval === "object" ? issued.get(approval) : undefined;
  if (!found) throw new NotApprovedError();
  issued.delete(approval); // one use only
  return charge(found.purchase, found.token);
}
