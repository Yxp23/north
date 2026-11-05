// Types for rules written in the user's own words. Everything here is plain data checked by code.
import type { Strength } from "../guardian";

export type RuleKind = "big_buy" | "late_night";

/** A rule the Concierge understood from the user's words. Not saved yet, and no strength chosen yet. */
export type Proposed =
  | { kind: "big_buy"; cents: number; waitHours?: number; suggested?: Strength; quote?: string }
  | { kind: "late_night"; afterHour: number; untilHour: number; waitHours?: number; suggested?: Strength; quote?: string };

export type UnsupportedReason =
  | "category"
  | "store_or_brand"
  | "budget_or_protected_money"
  | "loosening"
  | "not_a_rule"
  | "other";

export type UnsupportedNote = { reason: UnsupportedReason; quote?: string };

/** What the user finally asks us to save: a rule and the strength they picked. */
export type SaveRule =
  | { kind: "big_buy"; cents: number; strength: Strength; waitHours?: number }
  | { kind: "late_night"; afterHour: number; untilHour: number; strength: Strength; waitHours?: number };
