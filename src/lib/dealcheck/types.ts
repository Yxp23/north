// The deal check: facts in, verdict out. All of it is plain code. Prices here are whole cents and come from
// the store API (offers, history) or from the ad itself (the claim), never from model text.

export type Offer = { domain: string; cents: number };

/** The 30-day price history from Channel3, when we are tracking the product and it has points. */
export type HistoryFacts = { minCents: number; maxCents: number; meanCents: number; status: "low" | "typical" | "high"; points: number };

export type SellerFacts = {
  /** The seller named in the ad (from the link, or read from a picture). */
  domain: string | null;
  /** The seller really sells this product (or is a store we know). */
  known: boolean;
  /** A known seller this address looks like a copy of. */
  lookalikeOf: string | null;
  /** An address that looks odd by itself (a number address, tricky letters, many dashes). */
  odd: boolean;
};

export type Evidence = {
  /** We found the product at stores. */
  matched: boolean;
  productTitle?: string;
  /** What the ad says it costs. */
  claimedCents: number | null;
  /** The "was" price in the ad, if it shows one. */
  claimedWasCents?: number | null;
  /** In-stock offers, from the API. For the matched product, or (when `similar`) for the same kind of product. */
  offers: Offer[];
  /** True when no listing was exactly this product, so `offers` come from similar products. Never "fine". */
  similar?: boolean;
  history: HistoryFacts | null;
  seller: SellerFacts;
};

export type VerdictKind = "fine" | "careful" | "scam";

export type Verdict = {
  kind: VerdictKind;
  /** "This looks fine." / "Be careful." / "This looks like a scam." */
  headline: string;
  /** Why, in plain words. The first one is the main reason. */
  reasons: string[];
  /** The facts we looked at. */
  evidence: string[];
  /** True for a scam verdict with a known seller: the Guardian then refuses to pay that seller. */
  flagSeller: boolean;
  /** The main reason, as a short code (for tests and the eval). */
  code: string;
};
