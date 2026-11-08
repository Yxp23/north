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

const hourFormats = new Map<string, Intl.DateTimeFormat>();

/** The hour (0-23) on the user's own clock. Throws on a bad time zone. */
export function localHour(at: Date, timeZone: string): number {
  let fmt = hourFormats.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23", // 0-23, so midnight is 0 and never 24
      timeZone,
    }); // (throws for a time zone that doesn't exist, and then nothing is cached)
    if (hourFormats.size < 200) hourFormats.set(timeZone, fmt);
  }
  return Number(fmt.formatToParts(at).find((p) => p.type === "hour")!.value);
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

// ---- plain-language pieces for the reasons ---------------------------------------------------

/** 21 -> "9pm", 0 -> "12am", 12 -> "12pm". */
export function hourLabel(hour: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12}${hour >= 12 ? "pm" : "am"}`;
}

/** 24 -> "a day", 48 -> "2 days", 12 -> "12 hours". */
export function durationLabel(hours: number): string {
  if (hours % 24 === 0) return hours === 24 ? "a day" : `${hours / 24} days`;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** 24 -> "tomorrow", 48 -> "in 2 days", 12 -> "in 12 hours". */
export function remindLabel(hours: number): string {
  if (hours === 24) return "tomorrow";
  if (hours % 24 === 0) return `in ${hours / 24} days`;
  return `in ${hours === 1 ? "1 hour" : `${hours} hours`}`;
}
