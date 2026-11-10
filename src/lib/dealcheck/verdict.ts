// The verdict. Plain code, no AI: the same facts always give the same answer, and every price in the words
// comes from the facts we were given (store API values, or the ad's own claim). A model can never change it.
//
// How it decides (R = the lowest real price: the lowest of today's in-stock offers and the 30-day history):
//   claimed price under 50% of R        -> scam      ("This price isn't real.")
//   50% to under 80% of R               -> careful   (much lower than any real store)
//   80% to 115% of R                    -> fine
//   over 115% of R                      -> careful   (a price trap: not a deal)
// Then the seller can only make it worse:
//   a copy of a known seller's address  -> scam
//   a seller that is not a known store  -> careful (and a scam if the price was also too good)
//   an odd-looking address              -> careful
//   an old "was" price far above what stores ever charged -> careful
// Things we can't check (no product found, none in stock, no price) are careful: we never say "fine" blind.
// If no listing is exactly the product, we compare with SIMILAR products. That can warn, but never says "fine".
import { dollarsLabel } from "../rules/describe";
import type { Evidence, Verdict, VerdictKind } from "./types";

const LEVEL: VerdictKind[] = ["fine", "careful", "scam"];
const HEADLINE: Record<VerdictKind, string> = {
  fine: "This looks fine.",
  careful: "Be careful.",
  scam: "This looks like a scam.",
};

export const SCAM_BELOW = 0.5;
export const CAREFUL_BELOW = 0.8;
export const TRAP_ABOVE = 1.15;
export const MADE_UP_WAS = 1.3;

export function computeVerdict(e: Evidence): Verdict {
  let level = 0;
  let code = "ok";
  const reasons: string[] = [];
  const evidence: string[] = [];
  const sorted = [...e.offers].sort((a, b) => a.cents - b.cents);
  const cheapest = sorted[0];
  const claimedOk = e.claimedCents !== null && Number.isSafeInteger(e.claimedCents) && e.claimedCents > 0;
  const history = e.history && e.history.points > 0 ? e.history : null;
  const lowestReal = cheapest ? Math.min(cheapest.cents, history?.minCents ?? Infinity) : null;
  let priceChecked = false;
  let tooGood = false;

  // `code` names the strongest reason (the first one that reached the highest level).
  const add = (kind: number, why: string, text: string) => {
    if (kind > level || code === "ok") code = why;
    level = Math.max(level, kind);
    reasons.push(text);
  };

  // ---- evidence lines ------------------------------------------------------------------------
  if (claimedOk) evidence.push(`${e.fromListing ? "This listing says" : "The ad says"} ${dollarsLabel(e.claimedCents!)}.`);
  if (e.claimedWasCents && e.claimedWasCents > 0) evidence.push(`The ad's old price: ${dollarsLabel(e.claimedWasCents)}.`);
  if (cheapest) {
    const next = sorted[1];
    evidence.push(`${e.similar ? "Similar products today" : "Stores today"}: lowest ${dollarsLabel(cheapest.cents)} at ${cheapest.domain}.${next ? ` Next: ${dollarsLabel(next.cents)} at ${next.domain}.` : ""}`);
  }
  if (history) evidence.push(`Last 30 days: lowest ${dollarsLabel(history.minCents)}, usual ${dollarsLabel(history.meanCents)}, highest ${dollarsLabel(history.maxCents)}.`);
  else if (e.matched) evidence.push("I don't have a price history for this yet.");
  if (e.seller.domain === null) evidence.push("I don't know who is selling it.");
  else evidence.push(`Seller: ${e.seller.domain}.`);

  // ---- the price -----------------------------------------------------------------------------
  if (!claimedOk) {
    add(1, "no_price", "I couldn't find a price in the ad.");
  } else if (!e.matched) {
    add(1, "not_found", "I couldn't find this at any store I know, so I can't check the price.");
  } else if (!cheapest || lowestReal === null) {
    add(1, "not_in_stock", "I can't find it in stock anywhere I look, so I can't check the price.");
  } else if (e.similar) {
    // Not the exact product: warn if the price is far too low, but never say "fine".
    if (e.claimedCents! / lowestReal < SCAM_BELOW) {
      tooGood = true;
      add(1, "price_too_low_similar", `This price is much lower than I found for the same kind of product. The lowest I found was ${dollarsLabel(lowestReal)}. I couldn't find this exact product, so I can't be sure.`);
    } else {
      add(1, "similar_only", `I couldn't find this exact product, so I can only compare it to similar ones. The lowest price I found for similar ones was ${dollarsLabel(lowestReal)}.`);
    }
  } else {
    priceChecked = true;
    const ratio = e.claimedCents! / lowestReal;
    if (ratio < SCAM_BELOW) {
      tooGood = true;
      add(2, "price_not_real", `This price isn't real. The lowest real price ${history ? "in 30 days was" : "I found was"} ${dollarsLabel(lowestReal)}. I wouldn't buy it.`);
    } else if (ratio < CAREFUL_BELOW) {
      tooGood = true;
      add(1, "price_too_low", `This price is much lower than any store I know. The lowest real price ${history ? "in 30 days was" : "I found was"} ${dollarsLabel(lowestReal)}.`);
    } else if (ratio > TRAP_ABOVE) {
      add(1, "price_trap", cheapest.cents < e.claimedCents! ? `This isn't a deal. You can get it for ${dollarsLabel(cheapest.cents)} at ${cheapest.domain}.` : `This isn't a deal. The lowest real price ${history ? "in 30 days was" : "I found was"} ${dollarsLabel(lowestReal)}.`);
    }
  }

  // ---- the seller (can only make it worse) ---------------------------------------------------
  const s = e.seller;
  if (s.domain && s.lookalikeOf) {
    add(2, "lookalike_seller", `${s.domain} looks like a copy of ${s.lookalikeOf}.`);
  } else if (s.domain && !s.known) {
    add(tooGood ? 2 : 1, tooGood ? "unknown_seller_too_good" : "unknown_seller", `${s.domain} is not a store I know.${tooGood ? " A price this low from a store I don't know is a common trick." : ""}`);
  }
  if (s.domain && s.odd) add(1, "odd_address", `The seller's address looks odd: ${s.domain}.`);

  // ---- a made-up "was" price -----------------------------------------------------------------
  if (priceChecked && e.claimedWasCents) {
    const highestReal = Math.max(...e.offers.map((o) => o.cents), history?.maxCents ?? 0);
    if (e.claimedWasCents > highestReal * MADE_UP_WAS) add(1, "made_up_was", "The old price in the ad looks made up.");
  }

  const kind = LEVEL[level];
  if (kind === "fine") reasons.push("The price is close to what real stores charge.");
  return { kind, headline: HEADLINE[kind], reasons, evidence, flagSeller: kind === "scam" && !!s.domain, code };
}
