// Prices and discounts written in an ad, found by code. The model's own reading of an ad is checked
// against these, so it can't invent a price for text the user typed.
const MAX_CENTS = 10_000_000; // $100,000

function toCents(whole: string, cents?: string): number | null {
  const dollars = Number(whole.replace(/,/g, ""));
  if (!Number.isFinite(dollars)) return null;
  const c = Math.round(dollars * 100) + (cents ? Math.round(Number(`0.${cents}`) * 100) : 0);
  return c > 0 && c <= MAX_CENTS ? c : null;
}

/** Every price in the text, in the order written, in whole cents. */
export function extractPricesCents(text: string): number[] {
  const found: { at: number; cents: number }[] = [];
  const patterns: RegExp[] = [
    /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g,
    /\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars|bucks)\b/gi,
    /\bUSD\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const cents = toCents(m[1], m[2]);
      if (cents !== null) found.push({ at: m.index ?? 0, cents });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.cents);
}

/** "70% off" -> 70. */
export function percentOff(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*(?:%|percent)\s*off/i) ?? text.match(/\b(?:save|take)\s+(\d{1,3})\s*(?:%|percent)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 100 ? n : null;
}

const NOT_THE_ITEM_BEFORE = /\b(?:save|saves|saving|savings|shipping|delivery|fee|fees|tax|deposit|coupon|rebate|extra)[\s:]{0,2}(?:of\s+|up\s+to\s+|an?\s+)?$/i;
const NOT_THE_ITEM_AFTER = /^\s*(?:off\b|discount|coupon|rebate|shipping|delivery|fee|tax|savings?)/i;

/**
 * The prices in the text that are the ITEM's price: not "save $15", "$20 off", shipping, fees or coupons.
 * (The scam checker uses the LOWEST of these as the ad's claim, so a line planted in an ad can't talk it into
 * a higher number: the AI is only allowed to add caution.)
 */
export function itemPricesCents(text: string): number[] {
  const found: { at: number; cents: number }[] = [];
  const patterns: RegExp[] = [
    /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g,
    /\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars|bucks)\b/gi,
    /\bUSD\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const cents = toCents(m[1], m[2]);
      if (cents === null) continue;
      const at = m.index ?? 0;
      const before = text.slice(Math.max(0, at - 16), at);
      const after = text.slice(at + m[0].length, at + m[0].length + 14);
      if (NOT_THE_ITEM_BEFORE.test(before) || NOT_THE_ITEM_AFTER.test(after)) continue;
      found.push({ at, cents });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.cents);
}
