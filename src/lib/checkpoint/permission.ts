// "Agent permissions are user rules": what the person lets their assistant do without asking.
//   default: "Ask me every time".
//   optional: "My assistant can buy must-have things under $X without asking."
// It follows the same timing as the other rules (see rules/compare.ts): giving the assistant MORE freedom (turning it
// on, a higher $X) takes one day, so a bad moment can't talk the person into it; giving it LESS starts at once.
// Only the person's own tap changes it (by hand on My rules). The Concierge may only tighten rules, so it never turns this on.
import type { LedgerData } from "../ledger/types";
import { dollarsLabel } from "../rules/describe";
import type { Timing } from "../rules/compare";
import { inForce, makeChange, startsAt } from "../rules/stored";

type Allowance = { underCents: number } | null;
export const MIN_AUTO_CENTS = 100; // $1
export const MAX_AUTO_CENTS = 10_000; // $100: "small things", whatever else is true

export const assistantAllowance = (data: Pick<LedgerData, "agentCheckpoint">, now: Date): Allowance => inForce(data.agentCheckpoint.permission, now);

export function assistantTiming(force: Allowance, next: Allowance): Timing {
  if (next === null) return "now"; // asking every time is the strictest setting
  if (force === null) return "in_a_day"; // more freedom than before
  return next.underCents > force.underCents ? "in_a_day" : "now";
}

export type PermissionResult = { ok: true; changed: boolean; startsNow: boolean; startsAt: string; message: string } | { ok: false; message: string };

export function changeAssistantPermission(data: LedgerData, next: Allowance, now: Date): PermissionResult {
  if (next && (!Number.isInteger(next.underCents) || next.underCents < MIN_AUTO_CENTS || next.underCents > MAX_AUTO_CENTS)) {
    return { ok: false, message: `Please pick an amount from ${dollarsLabel(MIN_AUTO_CENTS)} to ${dollarsLabel(MAX_AUTO_CENTS)}.` };
  }
  const current = data.agentCheckpoint.permission;
  const force = inForce(current, now);
  const same = JSON.stringify(force) === JSON.stringify(next) && JSON.stringify(current.value) === JSON.stringify(next);
  if (same) return { ok: true, changed: false, startsNow: true, startsAt: startsAt("now", now), message: "That is the same as it is now." };
  const timing = assistantTiming(force, next);
  data.agentCheckpoint.permission = makeChange(next, current, timing, now);
  return {
    ok: true, changed: true, startsNow: timing === "now", startsAt: startsAt(timing, now),
    message: timing === "now" ? "Saved. It starts now." : "Saved. This lets your assistant do more, so it starts in one day. Until then, it asks you every time.",
  };
}

export function permissionInWords(data: Pick<LedgerData, "agentCheckpoint">, now: Date): string {
  const force = assistantAllowance(data, now);
  const base = force ? `Your assistant can buy must-have things under ${dollarsLabel(force.underCents)} without asking. Everything else, it asks you first.` : "Your assistant must ask you every time.";
  const c = data.agentCheckpoint.permission;
  const waiting = now.getTime() - new Date(c.changedAt).getTime() < 24 * 3_600_000 && JSON.stringify(c.value) !== JSON.stringify(force);
  if (!waiting) return base;
  return `${base} (A change is waiting: ${c.value ? `it can buy must-have things under ${dollarsLabel(c.value.underCents)} without asking.` : "it must ask you every time."})`;
}
