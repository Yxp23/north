// The words for Gentle, Firm and Locked: one plain line and one example each. Written for a 5th-grade reading level, and the same
// everywhere a strength is chosen. The examples never use a real amount or time, so they can't disagree with the person's own rule.
import type { Strength } from "@/lib/guardian";

export type RuleKind = "big_buy" | "late_night";

export const STRENGTH_COPY: Record<Strength, { title: string; line: string; example: (kind: RuleKind) => string }> = {
  gentle: {
    title: "Gentle",
    line: "I ask you first. You can still buy.",
    example: (k) => `${trying(k)} I ask: wait, or buy now? You choose.`,
  },
  firm: {
    title: "Firm",
    line: "I save it for later. You buy it after the wait.",
    example: (k) => `${trying(k)} I save it. You can buy it tomorrow.`,
  },
  locked: {
    title: "Locked",
    line: "I never let you buy it.",
    example: (k) => `${trying(k)} I say no. To buy, you must change the rule first.`,
  },
};

const trying = (k: RuleKind) => (k === "big_buy" ? "You try to buy something big." : "You try to buy something late at night.");

/** When a change that starts after one day will begin, in plain words: "tomorrow at 3:56 PM". Falls back to the weekday. */
export function whenPlain(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("en-CA"); // y-m-d in the person's own time zone
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const tomorrow = new Date(now.getTime() + 24 * 3_600_000);
  if (day(at) === day(now)) return `today at ${time}`;
  if (day(at) === day(tomorrow)) return `tomorrow at ${time}`;
  return `${at.toLocaleDateString("en-US", { weekday: "long" })} at ${time}`;
}
