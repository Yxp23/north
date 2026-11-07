// A short plain sentence from a model, or nothing. Used wherever a model writes words the user will read.
// The app shows every price and number itself, so the model's sentence may not hold any.

const NUMBER_WORDS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|half|double|triple|twice|once)\b/i;

/**
 * One short line: no digits, dollar signs, links, addresses or markup. Anything else is dropped (null).
 * `noNumberWords` also drops "three", "fifty", "half": use it when a count or an amount written in words would be a
 * claim that code cannot check (the app shows every real number itself).
 */
export function plainLine(s: unknown, maxLength: number, opts: { noNumberWords?: boolean } = {}): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t || t.length > maxLength) return null;
  if (/[\d$€£@<>]|https?:|www\.|\b[a-z0-9-]+\.(?:com|net|org|shop|store|example|co|io|app|xyz|top)\b/i.test(t)) return null;
  if (opts.noNumberWords && NUMBER_WORDS.test(t)) return null;
  return t;
}
