// The Money Guardian. Plain, pure code: no AI, no database, no network, no clock.
// Only the Guardian can approve a payment. Order of checks matters:
//   1. refuse (bad input, protected money, over budget). "Buy now" can't change these.
//   2. approve essentials (they never wait).
//   3. wait (big buy, late night). "Buy now" turns a wait into an approval.
import { effective, inLateNightWindow, isEssential, localHour } from "./rules";
import type { DecisionCode, GuardianResult, Purchase, UserState } from "./types";

function result(
  decision: GuardianResult["decision"],
  code: DecisionCode,
  reason: string,
  extra: Partial<Pick<GuardianResult, "canOverride" | "overridden">> = {},
): GuardianResult {
  return { decision, code, reason, canOverride: false, overridden: false, ...extra };
}

const refuse = (code: DecisionCode, reason: string) => result("refuse", code, reason);

export function decide(purchase: Purchase, state: UserState): GuardianResult {
  // ---- 1. Refuse -----------------------------------------------------------
  if (!Number.isSafeInteger(purchase.amountCents) || purchase.amountCents <= 0) {
    return refuse("bad_amount", "I can't read that price, so I can't buy it.");
  }

  // The user's clock decides "late at night". If we can't read it, don't guess.
  let hour: number;
  try {
    if (Number.isNaN(purchase.at.getTime())) throw new Error("bad date");
    hour = localHour(purchase.at, state.timeZone);
  } catch {
    return refuse("bad_input", "Something is wrong on my end, so I can't buy this.");
  }

  // Protected money can never be spent. Equal to the limit is fine: it stays whole.
  const spendable = state.balanceCents - state.protectedCents;
  if (purchase.amountCents > spendable) {
    return refuse("protected_money", "That would use money saved for rent and bills. I can't do that.");
  }

  // Exactly on the budget is fine; one cent over is not.
  if (state.spentThisWeekCents + purchase.amountCents > state.weeklyBudgetCents) {
    return refuse("over_budget", "That is more than what is left this week. I can't buy it.");
  }

  // ---- 2. Essentials never wait ---------------------------------------------
  const now = purchase.at;
  if (isEssential(purchase, effective(state.rules.essentials, now))) {
    return result("approve", "ok_essential", "This is on your must-have list. It is okay to buy.");
  }

  // ---- 3. Wait ---------------------------------------------------------------
  const limit = effective(state.rules.waitOverCents, now);
  const window = effective(state.rules.waitAfterHour, now);
  const isBig = limit !== null && purchase.amountCents > limit;
  const isLate = window !== null && inLateNightWindow(hour, window);

  if (isBig || isLate) {
    if (purchase.overrideWait === true) {
      return result("approve", "ok_override", "You chose to buy now. It is okay to buy.", { overridden: true });
    }
    if (isBig && isLate) {
      return result(
        "wait",
        "wait_big_buy_late_night",
        "This is a big buy, and it is late. You asked me to wait on both. Wait, or buy now?",
        { canOverride: true },
      );
    }
    return isBig
      ? result("wait", "wait_big_buy", "You asked me to wait on big buys. Wait, or buy now?", { canOverride: true })
      : result("wait", "wait_late_night", "You asked me to wait on late-night buys. Wait, or buy now?", { canOverride: true });
  }

  return result("approve", "ok", "This is okay to buy.");
}
