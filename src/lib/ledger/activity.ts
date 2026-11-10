// "What North did this week", in plain words, from the audit log. Only the kinds of entry listed here are shown, each worded by us from what
// the entry recorded (a name, a price, a verdict), so nothing technical (an id, a code, a token) ever reaches the screen.
import { localDate, weekStartDate } from "./logic";
import type { AuditEntry, LedgerData } from "./types";

export type ActivityTone = "good" | "wait" | "stop" | "quiet";
export type ActivityIcon = "check" | "clock" | "bookmark" | "hand" | "shield" | "bot" | "undo" | "eye" | "wallet";
export type ActivityLine = { at: string; icon: ActivityIcon; tone: ActivityTone; text: string };

const DECISION = /^(.*) \$([0-9,]+(?:\.[0-9]{2})?): (approve|wait|waitlist|refuse) \(([a-z_]+)\)$/;
const WHY: Record<string, string> = {
  protected_money: "It would have used the money set aside for rent and bills.",
  over_budget: "It was more than this week's plan.",
  locked_rule: "A locked rule said no.",
  scam_seller: "The seller was flagged as a scam.",
  untrusted_agent: "It was started by text in a listing, not by you.",
  bad_amount: "The price could not be read.",
  bad_input: "Something was not right, so it was not bought.",
};
const VERDICT: Record<string, string> = { fine: "looked fine", careful: "needed a careful look", scam: "looked like a scam" };
const clean = (s: string) => s.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);

export function describeEntry(a: AuditEntry): ActivityLine | null {
  const line = (icon: ActivityIcon, tone: ActivityTone, text: string): ActivityLine => ({ at: a.at, icon, tone, text });
  switch (a.type) {
    case "decision": {
      const m = DECISION.exec(a.detail);
      if (!m) return null;
      const [, name, price, decision, code] = m;
      if (decision === "approve") return line("check", "good", `North said yes to ${clean(name)}, $${price}.`);
      if (decision === "wait") return line("clock", "wait", `North asked you to wait or buy now: ${clean(name)}, $${price}.`);
      if (decision === "waitlist") return code === "waitlist_not_yet" ? line("clock", "wait", `${clean(name)} is not ready to buy yet.`) : line("bookmark", "wait", `North saved ${clean(name)}, $${price}, for later.`);
      return line("hand", "stop", `North stopped ${clean(name)}, $${price}. ${WHY[code] ?? ""}`.trim());
    }
    case "override": {
      const m = /^Buy now: (.*?), \$([0-9,]+(?:\.[0-9]{2})?),/.exec(a.detail);
      return m ? line("check", "good", `You chose Buy now for ${clean(m[1])}, $${m[2]}.`) : null;
    }
    case "paid":
      return null; // the decision line ("North said yes to ...") already says it; a receipt is on Money
    case "refund":
      return line("undo", "good", "A buy was refunded.");
    case "seller_flag": {
      const m = /^Flagged (\S+) as a scam seller/.exec(a.detail);
      return m ? line("shield", "stop", `North flagged ${clean(m[1])} as a scam seller. It will not pay them.`) : null;
    }
    case "deal_check": {
      const m = /^Deal check: (\w+)/.exec(a.detail);
      return m ? line("shield", m[1] === "scam" ? "stop" : m[1] === "careful" ? "wait" : "good", `You checked a deal. It ${VERDICT[m[1]] ?? "was checked"}.`) : null;
    }
    case "waitlisted":
      return null; // the decision line ("North saved ... for later") already says it
    case "waitlist_removed":
      return line("undo", "quiet", "You took something off your saved list.");
    case "waitlist_restored":
      return line("undo", "quiet", "You put something back on your saved list.");
    case "agent_connect":
      return line("bot", "quiet", "You connected an assistant.");
    case "agent_disconnect":
      return line("bot", "quiet", "You disconnected an assistant.");
    case "agent_request": {
      const m = /^An assistant \((.*?)\) asked to buy (.*?), \$([0-9,]+(?:\.[0-9]{2})?): (approve|wait|waitlist|refuse) \(([a-z_]+)\)/.exec(a.detail);
      if (!m) return a.detail.startsWith("An assistant") ? line("bot", "stop", "An assistant asked to buy something North could not find. Nothing was bought.") : null;
      const [, who, what, price, decision, code] = m;
      if (decision === "refuse") return line("bot", "stop", `North said no to ${clean(who)} asking for ${clean(what)}, $${price}. ${WHY[code] ?? ""}`.trim());
      if (decision === "waitlist") return line("bot", "wait", `${clean(who)} asked for ${clean(what)}, $${price}. North saved it for later.`);
      return line("bot", "wait", `${clean(who)} asked to buy ${clean(what)}, $${price}. It is waiting for your answer.`);
    }
    case "agent_proposal":
      return line("bot", "stop", "North stopped a buy that a listing's hidden words tried to start.");
    case "price_watch":
      return line("eye", "quiet", "The Price Watcher checked the prices of what you are waiting on.");
    case "watch_start":
      return line("eye", "quiet", clean(a.detail));
    case "rule_change":
      return line("check", "quiet", clean(a.detail.replace(/^By hand: /, "")));
    case "rule_change_cancelled":
      return line("undo", "quiet", "You undid a rule change before it started.");
    case "setup":
      return line("check", "quiet", clean(a.detail));
    case "paypal_connected":
      return line("wallet", "good", "You saved your PayPal. No money was taken.");
    default:
      return null;
  }
}

/** This week's entries, newest first, in plain words. Not shown: anything that is not worded above. */
export function weekActivity(data: LedgerData, now: Date, limit = 60): ActivityLine[] {
  const start = weekStartDate(now, data.timeZone);
  const out: ActivityLine[] = [];
  for (let i = data.audit.length - 1; i >= 0 && out.length < limit; i--) {
    const a = data.audit[i];
    if (localDate(new Date(a.at), data.timeZone) < start) continue;
    const l = describeEntry(a);
    if (l) out.push(l);
  }
  return out;
}

export type ThisWeek = { scamsStopped: number; savedForLater: number; stoppedBuys: number };

/** The numbers for Home's "North this week" card. Counted from the audit log, this week only. */
export function thisWeekStats(data: LedgerData, now: Date): ThisWeek {
  const start = weekStartDate(now, data.timeZone);
  let scamsStopped = 0;
  let savedForLater = 0;
  let stoppedBuys = 0;
  for (const a of data.audit) {
    if (localDate(new Date(a.at), data.timeZone) < start) continue;
    if (a.type === "seller_flag") scamsStopped++;
    else if (a.type === "waitlisted") savedForLater++;
    else if (a.type === "decision" && DECISION.exec(a.detail)?.[3] === "refuse") stoppedBuys++;
  }
  return { scamsStopped, savedForLater, stoppedBuys };
}
