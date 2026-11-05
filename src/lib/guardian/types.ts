// Money Guardian types. Money is always whole cents (never floats).

/** A rule the user can change. A change takes 24 hours to count (see rules.ts). */
export type Changeable<T> = {
  /** The newest setting. `null` means the rule is off. */
  value: T | null;
  /** When the user last changed it. */
  changedAt: Date;
  /** The setting that was in force before the change. `null` means the rule was off. */
  previous: T | null;
};

export type LateNightWindow = {
  /** Wait from this hour (0-23, the user's clock)... */
  afterHour: number;
  /** ...until this hour the next morning (0-23). */
  untilHour: number;
};

/**
 * How strict a wait rule is. The user picks it when they make the rule.
 *  - gentle: "Wait, or buy now?" Buy now works right away.
 *  - firm:   no Buy now. The buy goes on the waiting list, and after the wait it is a normal buy.
 *  - locked: never, while the rule is on. Only the one-day rule-change delay gets around it.
 */
export type Strength = "gentle" | "firm" | "locked";

/** Wait on buys over `cents`. */
export type BigBuyRule = { cents: number; strength: Strength; /** firm only. Default 24. */ waitHours?: number };
/** Wait on buys in the late-night window. */
export type LateNightRule = LateNightWindow & { strength: Strength; /** firm only. Default 24. */ waitHours?: number };

/** Which wait rule a decision is about. */
export type RuleId = "big_buy" | "late_night";

export const DEFAULT_WAIT_HOURS = 24;

export type Rules = {
  waitOverCents: Changeable<BigBuyRule>;
  waitAfterHour: Changeable<LateNightRule>;
  /** Categories that never wait, like "groceries". */
  essentials: Changeable<string[]>;
};

export type UserState = {
  /** All the money in the account. */
  balanceCents: number;
  /** Money for rent and bills. It can never be spent. */
  protectedCents: number;
  weeklyBudgetCents: number;
  spentThisWeekCents: number;
  /** IANA name like "America/New_York". The late-night rule uses the user's own clock. */
  timeZone: string;
  rules: Rules;
};

export type Purchase = {
  amountCents: number;
  /** The product title. Shown to people, never used to decide anything. */
  item: string;
  /** Matched against the user's essentials list. */
  category: string;
  /** When the user is buying. Also the "now" for the 24-hour rule delay. */
  at: Date;
  /** True when the user tapped "Buy now" on a wait screen. Only a gentle rule listens to it. */
  overrideWait?: boolean;
  /**
   * Set when this buy was saved on the waiting list earlier (from OUR records, never from the browser).
   * Once the wait is over it is a normal buy, still checked against the budget and protected money.
   */
  waitlist?: { since: Date; waitHours: number };
  /**
   * Caution flags. They come from the scam check and the injection check, which may use AI.
   * They can only make the answer stricter (a refuse). There is no flag that loosens anything.
   */
  sellerFlaggedScam?: boolean;
  agentStartedFromUntrustedText?: boolean;
};

/** wait = gentle (Buy now allowed). waitlist = firm (saved for later). refuse = a wall or a locked rule. */
export type Decision = "approve" | "wait" | "waitlist" | "refuse";

export type DecisionCode =
  | "ok"
  | "ok_essential"
  | "ok_override"
  | "ok_after_wait"
  | "wait_big_buy"
  | "wait_late_night"
  | "wait_big_buy_late_night"
  | "waitlist_big_buy"
  | "waitlist_late_night"
  | "waitlist_big_buy_late_night"
  | "waitlist_not_yet"
  | "locked_rule"
  | "scam_seller"
  | "untrusted_agent"
  | "over_budget"
  | "protected_money"
  | "bad_amount"
  | "bad_input";

export type GuardianResult = {
  decision: Decision;
  code: DecisionCode;
  /** Plain words, about a 5th-grade reading level. */
  reason: string;
  /** True only for a gentle wait. The user may tap "Buy now". */
  canOverride: boolean;
  /** True when "Buy now" actually turned a wait into an approval. */
  overridden: boolean;
  /** The rules "Buy now" got past. Logged to the audit log. Empty unless `overridden`. */
  overriddenRules: RuleId[];
  /** The wait rules that applied to this buy. */
  triggered: RuleId[];
  /** Firm waits only: how long to wait, and when the buy can be tried again. */
  waitHours?: number;
  remindAt?: Date;
};
