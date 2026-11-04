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

export type Rules = {
  /** Wait on buys over this many cents. */
  waitOverCents: Changeable<number>;
  /** Wait on buys during the late-night window. */
  waitAfterHour: Changeable<LateNightWindow>;
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
  /** True when the user tapped "Buy now" on a wait screen. */
  overrideWait?: boolean;
};

export type Decision = "approve" | "wait" | "refuse";

export type DecisionCode =
  | "ok"
  | "ok_essential"
  | "ok_override"
  | "wait_big_buy"
  | "wait_late_night"
  | "wait_big_buy_late_night"
  | "over_budget"
  | "protected_money"
  | "bad_amount"
  | "bad_input";

export type GuardianResult = {
  decision: Decision;
  code: DecisionCode;
  /** Plain words, about a 5th-grade reading level. */
  reason: string;
  /** True only for a wait. The user may tap "Buy now". */
  canOverride: boolean;
  /** True when "Buy now" actually turned a wait into an approval. */
  overridden: boolean;
};
