// A tiny in-memory limit (per server process). Enough to stop a loop in the browser from running up the AI bill.
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now): () => boolean {
  const recent: number[] = [];
  return () => {
    const t = now();
    while (recent.length && t - recent[0] >= windowMs) recent.shift();
    if (recent.length >= limit) return false;
    recent.push(t);
    return true;
  };
}
