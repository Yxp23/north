// "Help me choose": the model picks from products the store really returned. CODE checks the picks:
// they must be real handles, must fit the money left this week, must not repeat, and there must be exactly 3
// when 3 fit. Prices come from the store; the model's one-line reason is used only if it holds no numbers or links.
import { plainLine } from "../agents/plain-text";
import type { Shelf } from "./shelf";
import type { ShelfItem } from "./types";

export const PICKS_WANTED = 3;

export type Pick = { item: ShelfItem; reason: string; /** False when the reason is code's own words (the helper's was not usable). */ fromHelper: boolean };
export type CheckedPicks = {
  picks: Pick[];
  /** How many products on the shelf fit this week's money. */
  fitCount: number;
  /** The lowest price on the shelf, for the kind "nothing fits" answer. Undefined when the shelf is empty. */
  cheapestCents?: number;
  /** Set when the model should fix its picks and try again. */
  problem?: string;
};

export function checkPicks(opts: { shelf: Shelf; chosen: { handle: string; reason: string }[]; leftCents: number }): CheckedPicks {
  const { shelf, leftCents } = opts;
  const all = shelf.all();
  const fits = (i: ShelfItem) => i.priceCents <= leftCents;
  const fitting = all.filter(fits);

  const picks: Pick[] = [];
  const used = new Set<string>();
  for (const c of opts.chosen) {
    const item = shelf.get(c.handle);
    if (!item || used.has(item.id) || !fits(item)) continue;
    used.add(item.id);
    const reason = plainLine(c.reason, 140);
    picks.push({ item, reason: reason ?? "One of the lowest prices I found.", fromHelper: reason !== null });
    if (picks.length === PICKS_WANTED) break;
  }

  const result: CheckedPicks = { picks, fitCount: fitting.length, ...(all.length ? { cheapestCents: Math.min(...all.map((i) => i.priceCents)) } : {}) };
  const wanted = Math.min(PICKS_WANTED, fitting.length);
  if (picks.length < wanted) {
    const spare = fitting.filter((i) => !used.has(i.id)).map((i) => shelf.handleOf(i.id)).filter(Boolean);
    result.problem = `Pick exactly 3 products. Only ${picks.length} of your picks were real and fit the money. These also fit: ${spare.join(", ")}. Call submit_picks again with 3 handles.`;
  }
  return result;
}
