import type { Changeable, LateNightWindow, Purchase } from "./types";

export const RULE_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * The setting that counts right now. A change takes 24 hours: until then the
 * previous setting stays in force (and `null` means the rule was off).
 * Exactly 24 hours counts as done.
 */
export function effective<T>(rule: Changeable<T>, now: Date): T | null {
  const age = now.getTime() - rule.changedAt.getTime();
  return age >= RULE_DELAY_MS ? rule.value : rule.previous;
}

/** The hour (0-23) on the user's own clock. Throws on a bad time zone. */
export function localHour(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23", // 0-23, so midnight is 0 and never 24
    timeZone,
  }).formatToParts(at);
  return Number(parts.find((p) => p.type === "hour")!.value);
}

/** Is this hour inside the window? The window may cross midnight (10 PM to 5 AM). */
export function inLateNightWindow(hour: number, w: LateNightWindow): boolean {
  if (w.afterHour === w.untilHour) return false; // an empty window
  return w.afterHour < w.untilHour
    ? hour >= w.afterHour && hour < w.untilHour
    : hour >= w.afterHour || hour < w.untilHour;
}

const normalize = (s: string) => s.trim().toLowerCase();

/**
 * Essential only if the category is on the user's own list.
 * We never look at the item title, because titles come from sellers.
 */
export function isEssential(p: Purchase, list: string[] | null): boolean {
  if (!list) return false;
  const category = normalize(p.category);
  return category !== "" && list.some((entry) => normalize(entry) === category);
}
