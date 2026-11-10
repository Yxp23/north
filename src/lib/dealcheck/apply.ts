// What happens to the ledger after a deal check. The route and the demo-week seed both call this, so a scam verdict flags the seller in exactly one way.
// A scam verdict flags the seller (never removed), and the Money Guardian refuses to pay a flagged seller. A flag can only make things stricter.
import type { DealPayload } from "../agents/scam-checker/scam-checker";
import type { Ledger } from "../ledger/ledger";
import { addAudit, flagSeller } from "../ledger/logic";

export type Flagged = "yes" | "no_seller" | "not_saved" | "no";

export async function applyDealVerdict(ledger: Ledger, payload: DealPayload, stepCount: number, now: Date): Promise<Flagged> {
  let flagged: Flagged = "no";
  try {
    await ledger.update((d) => {
      if (payload.kind === "verdict") {
        addAudit(d, "deal_check", `Deal check: ${payload.verdict.kind} (${payload.verdict.code}). ${stepCount} steps.`, now);
        if (payload.verdict.flagSeller && payload.sellerDomain) {
          flagSeller(d, payload.sellerDomain, payload.verdict.reasons[0], now);
          addAudit(d, "seller_flag", `Flagged ${payload.sellerDomain} as a scam seller. ${payload.verdict.reasons[0]}`, now);
          flagged = "yes";
        } else if (payload.verdict.kind === "scam") {
          flagged = "no_seller";
        }
      }
    });
  } catch (e) {
    console.error("[deal-check] could not save the flag:", e instanceof Error ? e.name : "unknown");
    if (payload.kind === "verdict" && payload.verdict.kind === "scam") flagged = "not_saved";
  }
  return flagged;
}
