// The Money Guardian. Plain, pure code: no AI, no database, no network, no clock.
// Only the Guardian can approve a payment. Order of checks matters:
//   1. HARD WALLS (refuse). Nothing gets past these: not Buy now, not a served wait, not an essential,
//      not any strength of rule. Bad input, a scam seller, a buy an AI agent started from untrusted
//      listing text, protected money, the weekly budget.
//   2. ESSENTIALS (the user's must-have list) pass EVERY user rule: gentle, firm, locked, and a saved
//      item's timer. They never pass the walls above.
//   3. LOCKED rules (refuse). "Never, while the rule is on." No one-tap override. The only ways around
//      are the one-day rule-change delay (see rules.ts) or, later, the supporter saying yes.
//   4. A SAVED item keeps its own timer: it can't be bought until its full wait has passed, whatever the
//      time of day or whichever rules apply right now. After that it is a normal buy.
//   5. FIRM rules: no Buy now. The buy is saved on the waiting list.
//   6. GENTLE rules: "Wait, or buy now?" Buy now works right away.
// AI can only add caution: the only AI-fed inputs are flags that make step 1 refuse.
import { effective, hourLabel, durationLabel, inLateNightWindow, isEssential, localHour, remindLabel } from "./rules";
import { DEFAULT_WAIT_HOURS, type DecisionCode, type GuardianResult, type Purchase, type RuleId, type Strength, type UserState } from "./types";

const HOUR_MS = 3_600_000;

type Extra = Partial<Pick<GuardianResult, "canOverride" | "overridden" | "overriddenRules" | "triggered" | "waitHours" | "remindAt">>;

function result(decision: GuardianResult["decision"], code: DecisionCode, reason: string, extra: Extra = {}): GuardianResult {
  return { decision, code, reason, canOverride: false, overridden: false, overriddenRules: [], triggered: [], ...extra };
}

const refuse = (code: DecisionCode, reason: string, extra: Extra = {}) => result("refuse", code, reason, extra);

/** Reasons are plain words (about a 5th-grade level). Money amounts never appear: prices come from the store. */
const LOCKED_REASON = "You said never buy this kind of thing. To change that, edit your rule. It takes a day.";

type Hit = { id: RuleId; strength: Strength; waitHours: number; hour?: number };
const hoursOrDefault = (h: number | undefined) => (typeof h === "number" && Number.isFinite(h) && h > 0 ? h : DEFAULT_WAIT_HOURS);

const wholeCents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const isHour = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 23;
const STRENGTHS = new Set(["gentle", "firm", "locked", undefined]);

/** Do the money numbers and the rules make sense? (Rules are checked as they would count at the moment of the buy.) */
function validState(state: UserState): boolean {
  try {
    if (!state || typeof state !== "object") return false;
    if (!Number.isSafeInteger(state.balanceCents) || !wholeCents(state.protectedCents) || !wholeCents(state.weeklyBudgetCents) || !wholeCents(state.spentThisWeekCents)) return false;
    if (typeof state.timeZone !== "string" || !state.rules) return false;
    for (const rule of [state.rules.waitOverCents, state.rules.waitAfterHour, state.rules.essentials]) {
      if (!rule || !(rule.changedAt instanceof Date) || Number.isNaN(rule.changedAt.getTime())) return false;
    }
    for (const b of [state.rules.waitOverCents.value, state.rules.waitOverCents.previous]) {
      if (b !== null && (!b || !wholeCents(b.cents) || !STRENGTHS.has(b.strength))) return false;
    }
    for (const l of [state.rules.waitAfterHour.value, state.rules.waitAfterHour.previous]) {
      if (l !== null && (!l || !isHour(l.afterHour) || !isHour(l.untilHour) || !STRENGTHS.has(l.strength))) return false;
    }
    for (const e of [state.rules.essentials.value, state.rules.essentials.previous]) {
      if (e !== null && (!Array.isArray(e) || e.some((x) => typeof x !== "string"))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function decide(purchase: Purchase, state: UserState): GuardianResult {
  // ---- 1. Hard walls ---------------------------------------------------------------------------
  if (!Number.isSafeInteger(purchase.amountCents) || purchase.amountCents <= 0) {
    return refuse("bad_amount", "I can't read that price, so I can't buy it.");
  }

  // FAIL CLOSED on the person's own settings too. A number that is not a whole count of cents, or a rule that does not make
  // sense, is never read as "no limit": it is refused.
  if (!validState(state)) return refuse("bad_input", "Something is wrong on my end, so I can't buy this.");

  // The user's clock decides "late at night". If we can't read it, don't guess.
  let hour: number;
  try {
    if (Number.isNaN(purchase.at.getTime())) throw new Error("bad date");
    // The real hour is always worked out first, so an unreadable time zone is refused even when a pretend hour is given.
    const realHour = localHour(purchase.at, state.timeZone);
    if (purchase.hourOverride !== undefined) {
      // The demo clock: only the hour of day. Anything that is not a whole hour 0-23 is refused, never guessed.
      if (!Number.isInteger(purchase.hourOverride) || purchase.hourOverride < 0 || purchase.hourOverride > 23) throw new Error("bad hour");
      hour = purchase.hourOverride;
    } else {
      hour = realHour;
    }
  } catch {
    return refuse("bad_input", "Something is wrong on my end, so I can't buy this.");
  }

  if (purchase.sellerFlaggedScam === true) {
    return refuse("scam_seller", "This seller looks like a scam. I won't pay them.");
  }
  if (purchase.agentStartedFromUntrustedText === true) {
    return refuse("untrusted_agent", "This buy was started by text in a listing, not by you. I won't pay for it.");
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

  // ---- which wait rules apply to this buy ------------------------------------------------------
  const now = purchase.at;
  const bigRule = effective(state.rules.waitOverCents, now);
  const lateRule = effective(state.rules.waitAfterHour, now);
  const hits: Hit[] = [];
  if (bigRule && purchase.amountCents > bigRule.cents) {
    hits.push({ id: "big_buy", strength: bigRule.strength ?? "gentle", waitHours: hoursOrDefault(bigRule.waitHours) });
  }
  if (lateRule && inLateNightWindow(hour, lateRule)) {
    hits.push({ id: "late_night", strength: lateRule.strength ?? "gentle", waitHours: hoursOrDefault(lateRule.waitHours), hour: lateRule.afterHour });
  }
  const ids = (hs: Hit[]) => hs.map((h) => h.id);

  // ---- 2. Essentials pass every user rule (but not the walls above) ------------------------------
  const essential = isEssential(purchase, effective(state.rules.essentials, now));
  if (essential && (hits.length > 0 || purchase.waitlist)) {
    return result("approve", "ok_essential", "This is on your must-have list. It is okay to buy.", { triggered: ids(hits) });
  }

  // ---- 3. Locked: never ------------------------------------------------------------------------
  const locked = hits.filter((h) => h.strength === "locked");
  if (locked.length) {
    return refuse("locked_rule", LOCKED_REASON, { triggered: ids(hits) });
  }

  // ---- 4. A saved item keeps its own timer -------------------------------------------------------
  const saved = purchase.waitlist;
  const savedWait = saved ? hoursOrDefault(saved.waitHours) : 0;
  const readyAt = saved ? new Date(saved.since.getTime() + savedWait * HOUR_MS) : null;
  if (saved && readyAt) {
    if (now.getTime() < readyAt.getTime()) {
      // Not yet, whatever the time of day, whatever rules apply right now. Buy now does not hurry it.
      return result("waitlist", "waitlist_not_yet", `It is not time yet. I'll remind you ${remindLabel(savedWait)}.`, {
        triggered: ids(hits), waitHours: savedWait, remindAt: readyAt,
      });
    }
    // The wait is served: a normal buy (the walls were already checked above).
    return result("approve", hits.length ? "ok_after_wait" : "ok", hits.length ? "You waited, and I checked your money. It is okay to buy." : "This is okay to buy.", { triggered: ids(hits) });
  }

  if (hits.length === 0) {
    return result("approve", "ok", "This is okay to buy.");
  }

  // ---- 5. Firm: saved for later, no Buy now ----------------------------------------------------
  const firm = hits.filter((h) => h.strength === "firm");
  if (firm.length) {
    const waitHours = Math.max(...firm.map((h) => h.waitHours)); // when two firm rules apply, the longer wait
    const big = firm.find((h) => h.id === "big_buy");
    const late = firm.find((h) => h.id === "late_night");
    const dur = durationLabel(waitHours);
    const tail = `I saved it. I'll remind you ${remindLabel(waitHours)}.`;
    const [code, reason] =
      big && late
        ? (["waitlist_big_buy_late_night", `This is a big buy, and it is late. You asked me to wait ${dur} on both. ${tail}`] as const)
        : big
          ? (["waitlist_big_buy", `You asked me to wait ${dur} on big buys. ${tail}`] as const)
          : (["waitlist_late_night", `You asked me to wait ${dur} on buys after ${hourLabel(late!.hour!)}. ${tail}`] as const);
    return result("waitlist", code, reason, {
      triggered: ids(hits), waitHours, remindAt: new Date(now.getTime() + waitHours * HOUR_MS),
    });
  }

  // ---- 6. Gentle: Wait, or buy now? ------------------------------------------------------------
  if (purchase.overrideWait === true) {
    return result("approve", "ok_override", "You chose to buy now. It is okay to buy.", {
      overridden: true, overriddenRules: ids(hits), triggered: ids(hits),
    });
  }
  const big = hits.some((h) => h.id === "big_buy");
  const late = hits.some((h) => h.id === "late_night");
  const [code, reason] =
    big && late
      ? (["wait_big_buy_late_night", "This is a big buy, and it is late. You asked me to wait on both. Wait, or buy now?"] as const)
      : big
        ? (["wait_big_buy", "You asked me to wait on big buys. Wait, or buy now?"] as const)
        : (["wait_late_night", "You asked me to wait on late-night buys. Wait, or buy now?"] as const);
  return result("wait", code, reason, { canOverride: true, triggered: ids(hits) });
}
