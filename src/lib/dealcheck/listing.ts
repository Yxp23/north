// "Is this deal real?" from a PRODUCT PAGE. The product is already known: it is a Channel3 listing with its own id, so there is nothing to
// match and no ad to read. The facts are that listing's own prices at every store that sells it, and (when tracked) its 30-day history.
// So there is no model here at all, no "similar products", and no guessing: the verdict comes from computeVerdict on real facts.
// Made-up demo listings are NOT checked this way (they have no real stores to compare): they go through the pasted-ad check, which is
// where the demo's scam and trap listings are caught.
import type { Evidence, HistoryFacts, Offer } from "./types";
import { lookalikeOf, oddDomain } from "./seller";

export type ListingFacts = { title: string; offers: Offer[] };

/** Can this product be checked as a listing? Only a live Channel3 product with in-stock offers. */
export const isCheckableListing = (p: { live?: boolean; offers?: Offer[] } | null | undefined): boolean => !!p && p.live === true && (p.offers?.length ?? 0) > 0;

export function evidenceForListing(listing: ListingFacts, history: HistoryFacts | null): Evidence {
  const offers = [...listing.offers].sort((a, b) => a.cents - b.cents || a.domain.localeCompare(b.domain));
  const cheapest = offers[0];
  const others = offers.slice(1).map((o) => o.domain);
  return {
    matched: true,
    similar: false,
    fromListing: true,
    productTitle: listing.title,
    // The price the person would pay: this listing's own lowest price, from the store.
    claimedCents: cheapest.cents,
    claimedWasCents: null,
    offers,
    history,
    // Channel3 lists this seller as selling this exact product, so it is a store we know. A lookalike of one of the OTHER sellers still warns.
    seller: { domain: cheapest.domain, known: true, lookalikeOf: lookalikeOf(cheapest.domain, others), odd: oddDomain(cheapest.domain) },
  };
}
