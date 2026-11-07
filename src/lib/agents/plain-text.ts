// A short plain sentence from a model, or nothing. Used wherever a model writes words the user will read.
// The app shows every price and number itself, so the model's sentence may not hold any.

/** One short line: no digits, dollar signs, links, addresses or markup. Anything else is dropped (null). */
export function plainLine(s: unknown, maxLength: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t || t.length > maxLength) return null;
  if (/[\d$€£@<>]|https?:|www\.|\b[a-z0-9-]+\.(?:com|net|org|shop|store|example|co|io|app|xyz|top)\b/i.test(t)) return null;
  return t;
}
