// Setup: "how much can I spend each week" and "how much is set aside for rent and bills". Only the person's own logged-in tap reaches this
// (never an assistant).
//   - An account with no buys yet: first-run setup, everything starts at once.
//   - An account that already has buys: the normal rule-change timing. A STRICTER change (less each week, more set aside) starts at once. A LOOSER
//     one (more each week, less set aside) is saved to start in one day, and the old number stays in force until then, exactly like a weaker rule.
//     Nothing here is a way around that day. If one change is both, each number follows its own rule.
import { RULE_DELAY_MS } from "../guardian";
import type { LedgerData, MoneyPending } from "../ledger/types";
import { addAudit, applyMoneyFields } from "../ledger/logic";

export const SETUP_LIMITS = { weeklyMaxDollars: 5000, protectedMaxDollars: 50_000 };

export type SetupResult =
  | { ok: true; weeklyBudgetCents: number; protectedCents: number; /** Only for an account that has buys: what happened, in plain words. */ message?: string; changed?: boolean; pending?: MoneyPending }
  | { ok: false; message: string };

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export function applySetup(data: LedgerData, input: { weeklyDollars: unknown; protectedDollars: unknown }, now: Date): SetupResult {
  const w = Number(input.weeklyDollars);
  const p = Number(input.protectedDollars);
  if (!Number.isFinite(w) || !Number.isFinite(p) || w < 1 || p < 0 || w > SETUP_LIMITS.weeklyMaxDollars || p > SETUP_LIMITS.protectedMaxDollars) {
    return { ok: false, message: `Please use $1 to $${SETUP_LIMITS.weeklyMaxDollars.toLocaleString("en-US")} for each week, and $0 to $${SETUP_LIMITS.protectedMaxDollars.toLocaleString("en-US")} for rent and bills.` };
  }
  const weeklyBudgetCents = Math.round(w * 100);
  const protectedCents = Math.round(p * 100);
  if (data.purchases.length > 0) return changeMoney(data, weeklyBudgetCents, protectedCents, now);
  data.weeklyBudgetCents = weeklyBudgetCents;
  data.protectedCents = protectedCents;
  // The practice account's money: the protected amount plus plenty for the weekly plan to be the limit.
  data.baseBalanceCents = protectedCents + weeklyBudgetCents * 4;
  addAudit(data, "setup", `Weekly money ${dollars(weeklyBudgetCents)}, set aside for rent and bills ${dollars(protectedCents)}.`, now);
  return { ok: true, weeklyBudgetCents, protectedCents };
}

/** An account with buys: stricter numbers start now, looser ones wait one day (the old number stays in force until then). */
function changeMoney(data: LedgerData, weeklyBudgetCents: number, protectedCents: number, now: Date): SetupResult {
  const stricter: { weeklyBudgetCents?: number; protectedCents?: number } = {};
  const looser: { weeklyBudgetCents?: number; protectedCents?: number } = {};
  if (weeklyBudgetCents < data.weeklyBudgetCents) stricter.weeklyBudgetCents = weeklyBudgetCents;
  else if (weeklyBudgetCents > data.weeklyBudgetCents) looser.weeklyBudgetCents = weeklyBudgetCents;
  if (protectedCents > data.protectedCents) stricter.protectedCents = protectedCents;
  else if (protectedCents < data.protectedCents) looser.protectedCents = protectedCents;

  const before = data.agentCheckpoint.pendingMoney ?? null;
  const hasLooser = Object.keys(looser).length > 0;
  const hasStricter = Object.keys(stricter).length > 0;
  applyMoneyFields(data, stricter);
  // What is waiting is exactly what was asked for now: a number that went stricter, or back to what is in force, drops out of the wait.
  // Asking for the same loosening again must not restart its day.
  const sameAsWaiting = !!before && before.weeklyBudgetCents === looser.weeklyBudgetCents && before.protectedCents === looser.protectedCents;
  const pending: MoneyPending | null = !hasLooser ? null : sameAsWaiting ? before : { ...looser, askedAt: now.toISOString(), startsAt: new Date(now.getTime() + RULE_DELAY_MS).toISOString() };
  data.agentCheckpoint.pendingMoney = pending;

  const changed = hasStricter || (pending !== null && !sameAsWaiting) || (before !== null && pending === null);
  if (hasStricter) addAudit(data, "setup", `By hand: weekly money ${dollars(data.weeklyBudgetCents)}, set aside for rent and bills ${dollars(data.protectedCents)}. Started right away.`, now);
  if (pending && !sameAsWaiting) {
    const bits = [pending.weeklyBudgetCents !== undefined && `weekly money ${dollars(pending.weeklyBudgetCents)}`, pending.protectedCents !== undefined && `set aside for rent and bills ${dollars(pending.protectedCents)}`].filter(Boolean).join(" and ");
    addAudit(data, "setup", `By hand: ${bits}. This lets you spend more, so it starts in one day.`, now);
  }

  let message: string;
  if (!changed) message = "That is what you have now. Nothing changed.";
  else if (hasStricter && pending) message = "Saved. The part that keeps more safe started right away. The part that lets you spend more starts tomorrow. Until then, your old numbers stay for that part.";
  else if (pending) message = "Saved. This lets you spend more, so it starts tomorrow. Until then, your old numbers stay.";
  else message = "Saved. This keeps more safe, so it started right away.";
  return { ok: true, weeklyBudgetCents: data.weeklyBudgetCents, protectedCents: data.protectedCents, message, changed, ...(pending ? { pending } : {}) };
}

/** Undo a looser change that has not started yet. It can never make anything looser: it only removes the wait. */
export function cancelPendingMoney(data: LedgerData, now: Date): { ok: true; message: string } {
  if (!data.agentCheckpoint.pendingMoney) return { ok: true, message: "There is no change waiting." };
  data.agentCheckpoint.pendingMoney = null;
  addAudit(data, "setup", "By hand: the weekly-money change that was waiting was cancelled. Your numbers stay as they are.", now);
  return { ok: true, message: "Done. Nothing changes. Your numbers stay as they are." };
}

export { setupFinished } from "./finished";
