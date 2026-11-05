// Small helpers for reading and writing a stored rule, shared by every code path that changes rules.
import { RULE_DELAY_MS } from "../guardian";
import type { StoredChangeable } from "../ledger/types";
import type { Timing } from "./compare";

/** The setting that counts right now: the new one after 24 hours, the old one until then. */
export function inForce<T>(r: StoredChangeable<T>, now: Date): T | null {
  return now.getTime() - new Date(r.changedAt).getTime() >= RULE_DELAY_MS ? r.value : r.previous;
}

/**
 * The stored record for a change. `null` means "turn the rule off".
 *  - "now": dated 24 hours back, so the Guardian counts it at once. `askedAt` keeps the real time.
 *  - "in_a_day": dated now, so the old rule stays in force for 24 hours.
 * Either way a change that was still waiting is replaced by this one.
 */
export function makeChange<T>(next: T | null, current: StoredChangeable<T>, timing: Timing, now: Date): StoredChangeable<T> {
  const previous = inForce(current, now);
  if (timing === "in_a_day") return { value: next, changedAt: now.toISOString(), previous };
  return { value: next, changedAt: new Date(now.getTime() - RULE_DELAY_MS).toISOString(), previous, askedAt: now.toISOString() };
}

export const startsAt = (timing: Timing, now: Date) => new Date(now.getTime() + (timing === "now" ? 0 : RULE_DELAY_MS)).toISOString();
