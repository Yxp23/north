// What the browser may ask us to save. Checked again on the server, no matter what the screen did.
import { z } from "zod";

const strength = z.enum(["gentle", "firm", "locked"]);
const waitHours = z.number().int().min(1).max(168).optional(); // up to a week

const bigBuy = z.object({
  kind: z.literal("big_buy"),
  cents: z.number().int().min(100).max(10_000_000), // $1 to $100,000, whole cents
  strength,
  waitHours,
}).strict();

const lateNight = z.object({
  kind: z.literal("late_night"),
  afterHour: z.number().int().min(0).max(23),
  untilHour: z.number().int().min(0).max(23),
  strength,
  waitHours,
}).strict().refine((r) => r.afterHour !== r.untilHour, { message: "The night window can't start and end at the same hour." });

export const RuleSchema = z.discriminatedUnion("kind", [bigBuy, lateNight]);

export const SaveRequestSchema = z.object({
  rules: z.array(RuleSchema).min(1).max(2),
}).strict();

/** "Change or remove a rule" by hand: set one rule to something, or turn one off. */
export const ChangeRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), rule: RuleSchema }).strict(),
  z.object({ action: z.literal("remove"), kind: z.enum(["big_buy", "late_night"]) }).strict(),
  /** Undo a change that has not started yet: the rule stays exactly as it is now. */
  z.object({ action: z.literal("cancel"), kind: z.enum(["big_buy", "late_night"]) }).strict(),
]);
