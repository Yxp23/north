// The line under a decision's title. It must not repeat the title or the Guardian's own sentence. It says what the person asked for
// (their own rule) and the price, so the answer makes sense at a glance: "You asked me to wait on buys over $50. This is $72.54."
// Every number comes from a checked value (the store's price, the rule in force, the ledger), never from a model. The Guardian's own words
// are not changed: they stay in "How North decided".
import type { CheckoutOutcome } from "../checkout/checkout";
import { durationLabel, hourLabel } from "../guardian/rules";
import type { BigBuyRule, LateNightRule, RuleId } from "../guardian/types";
import { dollarsLabel } from "../rules/describe";
import { formatMoney } from "../format";

export type RuleFact = { kind: RuleId; rule?: BigBuyRule | LateNightRule };
export type SubtitleFacts = {
  name: string;
  /** The total for this buy (the price on screen). */
  priceCents: number;
  /** What was left this week when the person began the buy, if known. */
  leftCents?: number | null;
  /** The rules in force, if known. */
  rules?: RuleFact[] | null;
  /** The seller's address (already masked in video-safe mode), if known. */
  seller?: string | null;
};

const what = (r: RuleFact): string | null => {
  if (!r.rule) return null;
  return r.kind === "big_buy" ? `buys over ${dollarsLabel((r.rule as BigBuyRule).cents)}` : `buys after ${hourLabel((r.rule as LateNightRule).afterHour)}`;
};

/** "You asked me to wait on buys over $50." Built from the rules that really applied. Empty when the rule is not known. */
export function yourRuleSentence(triggered: RuleId[], rules: RuleFact[] | null | undefined, mode: "wait" | "locked"): string {
  const parts = triggered
    .map((id) => rules?.find((r) => r.kind === id))
    .filter((r): r is RuleFact => !!r && !!r.rule)
    .map((r) => ({ what: what(r)!, hours: (r.rule as BigBuyRule).waitHours, firm: r.rule!.strength === "firm" }));
  if (parts.length === 0) return "";
  const joined = parts.map((p) => p.what).join(" and ");
  if (mode === "locked") return `You said never to buy ${joined.replace(/^buys /, "")}.`.replace("never to buy over", "never to buy things over").replace("never to buy after", "never to buy anything after");
  const hours = parts.find((p) => p.firm)?.hours ?? 24;
  return parts.some((p) => p.firm) ? `You asked me to wait ${durationLabel(hours)} on ${joined}.` : `You asked me to wait on ${joined}.`;
}

/** What the green "Approved" dialog says once the money has really moved. The item and the details are in the receipt below it. */
export const paidSentence = (cents: number): string => `Your rules said yes. PayPal paid ${formatMoney(cents)}.`;

/** The subtitle for an outcome, or null to keep the Guardian's own sentence (when we do not know enough to say it better). */
export function decisionSubtitle(o: CheckoutOutcome, f: SubtitleFacts): string | null {
  const price = formatMoney(f.priceCents);
  switch (o.kind) {
    case "paid":
      return paidSentence(o.purchase.amountCents);
    case "wait": {
      const rule = yourRuleSentence(o.result.triggered, f.rules, "wait");
      return rule ? `${rule} This is ${price}.` : null;
    }
    case "waitlisted": {
      if (o.result.code === "waitlist_not_yet") return null;
      const rule = yourRuleSentence(o.result.triggered, f.rules, "wait");
      const hours = o.result.waitHours;
      const remind = hours === undefined || hours === 24 ? "tomorrow" : `in ${durationLabel(hours)}`;
      return rule ? `${rule} This is ${price}. I will remind you ${remind}.` : null;
    }
    case "refused": {
      switch (o.result.code) {
        case "locked_rule": {
          const rule = yourRuleSentence(o.result.triggered, f.rules, "locked");
          return rule ? `${rule} This is ${price}.` : null;
        }
        case "over_budget":
          return typeof f.leftCents === "number" ? `This is ${price}. You have ${formatMoney(f.leftCents)} left this week.` : `This is ${price}, and that is more than your plan for this week.`;
        case "protected_money":
          return `This is ${price}. Paying it would dip into the money you set aside for rent and bills.`;
        case "scam_seller":
          return f.seller ? `${f.seller} was flagged as a scam when you checked a deal. This is ${price}.` : null;
        default:
          return null;
      }
    }
    default:
      return null;
  }
}
