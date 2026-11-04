// The only door to the charge step.
//
// `requestApproval` runs the Guardian and, only on "approve", hands back an Approval.
// `withApproval` is the only way to run code that moves money: it checks the Approval
// was really issued here, burns it (one use), and passes the *approved* purchase to the
// charge function. A forged or copied object, or a second use, throws and charges nothing.
import { decide } from "./guardian";
import type { GuardianResult, Purchase, UserState } from "./types";

declare const approvalBrand: unique symbol;

/** Proof that the Guardian approved a purchase. Can't be built by hand (see `issued`). */
export type Approval = {
  readonly [approvalBrand]: true;
  readonly purchase: Readonly<Purchase>;
  readonly result: GuardianResult;
};

export class NotApprovedError extends Error {
  constructor() {
    super("No Guardian approval for this purchase.");
    this.name = "NotApprovedError";
  }
}

// Real approvals only, keyed by object identity. A copy or look-alike is not in here.
// The value is a private frozen copy of the purchase, so later edits can't change the amount.
const issued = new WeakMap<object, Readonly<Purchase>>();

export function requestApproval(
  purchase: Purchase,
  state: UserState,
): { result: GuardianResult; approval: Approval | null } {
  const result = decide(purchase, state);
  if (result.decision !== "approve") return { result, approval: null };

  const approved = Object.freeze({ ...purchase, at: new Date(purchase.at.getTime()) });
  const approval = Object.freeze({ purchase: approved, result }) as unknown as Approval;
  issued.set(approval, approved);
  return { result, approval };
}

/** Runs `charge` only for a real, unused approval. */
export async function withApproval<T>(
  approval: Approval,
  charge: (purchase: Readonly<Purchase>) => Promise<T>,
): Promise<T> {
  const purchase = approval && typeof approval === "object" ? issued.get(approval) : undefined;
  if (!purchase) throw new NotApprovedError();
  issued.delete(approval); // one use only
  return charge(purchase);
}
