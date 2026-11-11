// "Is the cheapest price believable?" Sometimes one store's price is far below all the others for the same product: usually a kids' size,
// a different version, or an old listing. Pure and shared (the product screen, the results cards and the deal check all use it), so every place
// treats it the same way. It only ever adds caution: it never makes a price look better.
export const VARIES_BELOW = 0.6;

export const PRICES_VARY_NOTE = "Prices vary a lot. The cheapest may be a kids' size or a different version. Check the size before you buy.";
export const PRICES_VARY_SHORT = "Prices vary a lot. Check the size before you buy.";

/**
 * True when the cheapest offer is under 60% of the typical (median) price of the stores. With two stores the typical price is the other one.
 * One store alone has nothing to compare with, so it is never flagged.
 */
export function pricesVary(offers: { cents: number }[]): boolean {
  const prices = offers.map((o) => o.cents).filter((c) => Number.isFinite(c) && c > 0).sort((a, b) => a - b);
  if (prices.length < 2) return false;
  const cheapest = prices[0];
  const typical = prices.length === 2 ? prices[1] : median(prices);
  return cheapest < typical * VARIES_BELOW;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
