// Seller addresses. Finding the domain in pasted text, and spotting copies of known sellers, is all code:
// a picture or a link can say anything, so the model never decides who the seller is on its own.

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidDomain(d: string): boolean {
  if (typeof d !== "string" || d.length < 4 || d.length > 253) return false;
  const labels = d.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,24}$/.test(tld) || /^xn--[a-z0-9-]+$/.test(tld);
}

const clean = (host: string) => host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

/** The first web address in some pasted text, as a plain domain ("shop.example"), or null. */
export function domainFromText(text: string): string | null {
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[("'<\[]+/, "").replace(/[)"'>\],;!?]+$/, "");
    if (!token) continue;
    if (/^https?:\/\//i.test(token)) {
      try {
        const host = clean(new URL(token).hostname);
        if (isValidDomain(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
      } catch {
        /* not a real address: keep looking */
      }
      continue;
    }
    // A bare address like "superkicks.shop" or "www.shop.example/path".
    const m = token.match(/^((?:[a-z0-9-]+\.)+[a-z]{2,24})(?::\d+)?(?:[/?#].*)?\.?$/i);
    if (m) {
      const host = clean(m[1]);
      if (isValidDomain(host) && !/^\d+$/.test(host.split(".")[0])) return host;
    }
  }
  return null;
}

/** Things that look the same to a quick reader. */
const SAME_LOOK: [RegExp, string][] = [[/rn/g, "m"], [/vv/g, "w"], [/0/g, "o"], [/1/g, "l"]];

/** The main name in an address, without the ending: "kickscrew-outlet.shop" -> "kickscrewoutlet". */
function core(domain: string): string {
  const labels = clean(domain).split(".");
  const n = labels.length;
  // shop.example.co.uk: the name is the label before "co.uk"
  const name = n >= 3 && labels[n - 1].length === 2 && labels[n - 2].length <= 3 ? labels[n - 3] : labels[Math.max(0, n - 2)];
  let out = name.replace(/-/g, "");
  for (const [from, to] of SAME_LOOK) out = out.replace(from, to);
  return out;
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** The known seller this address copies, or null. Short names are skipped: they cause false alarms. */
export function lookalikeOf(domain: string, known: string[]): string | null {
  const d = clean(domain);
  if (known.some((k) => clean(k) === d)) return null;
  const c = core(d);
  for (const k of known) {
    const kc = core(k);
    if (kc.length < 5) continue;
    if (c === kc || c.includes(kc) || (kc.length >= 6 && distance(c, kc) <= 1)) return clean(k);
  }
  return null;
}

/** An address that is odd all by itself. */
export function oddDomain(domain: string): boolean {
  const d = clean(domain);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return true;
  const labels = d.split(".");
  if (labels.some((l) => l.startsWith("xn--"))) return true;
  return (labels[Math.max(0, labels.length - 2)].match(/-/g) ?? []).length >= 3;
}
