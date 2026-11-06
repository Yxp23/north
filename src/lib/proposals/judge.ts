// The Money Guardian judging what an AGENT suggested. This is a separate door from checkout, on purpose:
//   - it never charges anything and never asks for an approval token (no requestApproval / withApproval),
//   - the price comes from the store, never from the agent,
//   - every suggestion here is marked "started by an agent, not by the user". In this flow the user only asked
//     what a product is. They did not ask to buy. So the Guardian's hard wall refuses every one of them,
//     whatever the model said and whatever it was tricked into.
// Real buys only start when the user taps Buy, which goes through guarded checkout.
import { decide, type GuardianResult, type UserState } from "../guardian";
import type { Proposal } from "../agents/concierge/listing";
import type { StoreProvider } from "../store";

export type Judged = {
  productId: string;
  productName?: string;
  quantity: number;
  amountCents?: number;
  /** The Guardian's answer. Null when the product does not exist. */
  result: GuardianResult | null;
  /** Always false. A suggestion can never buy anything. */
  bought: false;
  /** One plain sentence for the screen, built from the Guardian's own words. */
  plain: string;
};

export async function judgeProposals(
  proposals: Proposal[],
  deps: { store: StoreProvider; state: UserState; flaggedSellers: string[]; at: Date },
): Promise<Judged[]> {
  const out: Judged[] = [];
  for (const p of proposals) {
    const product = await deps.store.getProduct(p.productId);
    if (!product) {
      out.push({ productId: p.productId, quantity: p.quantity, result: null, bought: false, plain: "I couldn't find that product. Nothing was bought." });
      continue;
    }
    const amountCents = product.priceCents * p.quantity;
    const result = decide(
      {
        amountCents,
        item: product.name,
        category: product.category,
        at: deps.at,
        sellerFlaggedScam: !!product.sellerDomain && deps.flaggedSellers.includes(product.sellerDomain),
        // The user did not ask for this. An agent did, after reading text from a listing.
        agentStartedFromUntrustedText: true,
      },
      deps.state,
    );
    out.push({
      productId: product.id,
      productName: product.name,
      quantity: p.quantity,
      amountCents,
      result,
      bought: false,
      plain: `The helper suggested buying ${p.quantity} of ${product.name}. The Money Guardian said ${result.decision === "refuse" ? "no" : "wait"}: ${result.reason} Nothing was bought.`,
    });
  }
  return out;
}
