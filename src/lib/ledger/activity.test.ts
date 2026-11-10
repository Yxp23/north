import { describe, expect, it } from "vitest";
import { describeEntry, thisWeekStats, weekActivity } from "./activity";
import { addAudit, defaultLedgerData, summarize } from "./logic";

const NOW = new Date("2026-11-11T17:00:00Z"); // Wednesday
const fresh = () => defaultLedgerData(NOW, "America/New_York");

describe("What North did this week, in plain words", () => {
  it("words each kind of entry from what it recorded, with no ids or codes", () => {
    const e = (type: string, detail: string) => describeEntry({ at: NOW.toISOString(), type, detail });
    expect(e("decision", "Running Series Sneakers $72.54: wait (wait_big_buy)")?.text).toBe("North asked you to wait or buy now: Running Series Sneakers, $72.54.");
    expect(e("decision", "Over-Ear Headphones $349.00: refuse (protected_money)")?.text).toBe("North stopped Over-Ear Headphones, $349.00. It would have used the money set aside for rent and bills.");
    expect(e("decision", "Stainless Steel Water Bottle $37.00: waitlist (waitlist_late_night)")?.text).toBe("North saved Stainless Steel Water Bottle, $37.00, for later.");
    expect(e("seller_flag", "Flagged socks-clearance-outlet.shop as a scam seller. Too good to be true.")?.text).toBe("North flagged socks-clearance-outlet.shop as a scam seller. It will not pay them.");
    expect(e("override", "Buy now: Running Series Sneakers, $72.54, rule: wait on big buys (big_buy)")?.text).toBe("You chose Buy now for Running Series Sneakers, $72.54.");
    expect(e("agent_request", "An assistant (My assistant) asked to buy Umbrella, $10.00: approve (ok).")?.text).toBe("My assistant asked to buy Umbrella, $10.00. It is waiting for your answer.");
    expect(e("agent_request", "An assistant (Bot) asked to buy Headphones, $349.00: refuse (protected_money).")?.text).toBe("North said no to Bot asking for Headphones, $349.00. It would have used the money set aside for rent and bills.");
    // said once, not twice: the decision line covers a payment and a save
    expect(e("paid", "pur_abc123 $22.47 (COMPLETED)")).toBeNull();
    expect(e("waitlisted", "Bottle $37.00: saved, remind x")).toBeNull();
    for (const t of ["decision", "seller_flag", "agent_request"]) expect(e(t, "pur_abc123 $22.47 (COMPLETED) approve (ok)")?.text ?? "").not.toMatch(/pur_|COMPLETED|wait_big_buy|approve \(ok\)/);
  });
  it("shows nothing for entries it does not know, and never any markup", () => {
    expect(describeEntry({ at: NOW.toISOString(), type: "webhook_completed", detail: "pur_1 capture CAP-1" })).toBeNull();
    expect(describeEntry({ at: NOW.toISOString(), type: "decision", detail: "<script>alert(1)</script> $5.00: refuse (scam_seller)" })?.text).not.toMatch(/[<>]/);
  });
  it("lists this week's entries, newest first, and leaves last week out", () => {
    const d = fresh();
    addAudit(d, "decision", "Old thing $5.00: refuse (over_budget)", new Date("2026-11-04T17:00:00Z")); // last week
    addAudit(d, "decision", "Socks $22.47: approve (ok)", new Date("2026-11-10T17:00:00Z"));
    addAudit(d, "decision", "Shoes $72.54: wait (wait_big_buy)", new Date("2026-11-11T16:00:00Z"));
    const lines = weekActivity(d, NOW);
    expect(lines.map((l) => l.text)).toEqual(["North asked you to wait or buy now: Shoes, $72.54.", "North said yes to Socks, $22.47."]);
  });
  it("counts the card's numbers from this week only, and puts them in the summary", () => {
    const d = fresh();
    addAudit(d, "seller_flag", "Flagged a.shop as a scam seller. x", NOW);
    addAudit(d, "waitlisted", "Bottle $37.00: saved, remind 2026-11-12", NOW);
    addAudit(d, "decision", "Headphones $349.00: refuse (protected_money)", NOW);
    addAudit(d, "seller_flag", "Flagged old.shop as a scam seller. x", new Date("2026-11-03T17:00:00Z")); // last week
    expect(thisWeekStats(d, NOW)).toEqual({ scamsStopped: 1, savedForLater: 1, stoppedBuys: 1 });
    expect(summarize(d, NOW).thisWeek).toEqual({ scamsStopped: 1, savedForLater: 1, stoppedBuys: 1 });
  });
});
