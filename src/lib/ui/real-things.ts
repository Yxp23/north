// "Money in real things": a big amount next to everyday items, as a rough guide ("$72 is about 6 lunches").
// Whole-number guesses from typical prices, always worded with "about". The amount itself always comes from the store or the ledger.
export type RealThings = { text: string; basis: string };

const COFFEE = 500;
const LUNCH = 1200;
const GROCERY_WEEK = 10000;

export function realThings(cents: number): RealThings | null {
  if (!Number.isFinite(cents) || cents < COFFEE) return null;
  if (cents < LUNCH) {
    const n = Math.max(1, Math.round(cents / COFFEE));
    return { text: `about ${n} ${n === 1 ? "coffee" : "coffees"}`, basis: "Counting a coffee as about $5." };
  }
  if (cents <= 30000) {
    const n = Math.max(1, Math.round(cents / LUNCH));
    return { text: `about ${n} ${n === 1 ? "lunch" : "lunches"}`, basis: "Counting a lunch as about $12." };
  }
  const n = Math.min(99, Math.max(1, Math.round(cents / GROCERY_WEEK)));
  return { text: `about ${n} ${n === 1 ? "week" : "weeks"} of groceries`, basis: "Counting a week of groceries as about $100." };
}

/** A sentence for a big amount: "$72.00 is about 6 lunches." Returns "" when the amount is too small to be worth saying. */
export function realThingsSentence(cents: number, money: string): string {
  const r = realThings(cents);
  return r ? `${money} is ${r.text}.` : "";
}
