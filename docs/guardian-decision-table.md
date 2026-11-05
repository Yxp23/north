# Money Guardian: decision table

Generated from the real `decide()` function by `src/lib/guardian/decision-table.test.ts`. Do not edit by hand:
run `UPDATE_DOCS=1 npx vitest run src/lib/guardian/decision-table.test.ts` after changing the Guardian.

Demo user: $1,600 in the account, $1,200 protected for rent and bills (so $400 can be spent), $400 a week.
Wait rules: over $50, and after 9 PM. Firm waits are 24 hours. Must-have list: groceries.

## Wait rules: strength x situation

| Situation | Gentle | Firm | Locked |
|---|---|---|---|
| Nothing in the way ($10, noon) | **APPROVE** `ok`<br>This is okay to buy. | **APPROVE** `ok`<br>This is okay to buy. | **APPROVE** `ok`<br>This is okay to buy. |
| Big buy ($90, noon). Rule: wait on buys over $50 | **WAIT (Buy now works)** `wait_big_buy`<br>You asked me to wait on big buys. Wait, or buy now? | **SAVE FOR LATER (no Buy now)** `waitlist_big_buy`<br>You asked me to wait a day on big buys. I saved it. I'll remind you tomorrow. | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Late buy ($10, 10 PM). Rule: wait on buys after 9 PM | **WAIT (Buy now works)** `wait_late_night`<br>You asked me to wait on late-night buys. Wait, or buy now? | **SAVE FOR LATER (no Buy now)** `waitlist_late_night`<br>You asked me to wait a day on buys after 9pm. I saved it. I'll remind you tomorrow. | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Big buy, user taps Buy now | **APPROVE** `ok_override`<br>You chose to buy now. It is okay to buy. | **SAVE FOR LATER (no Buy now)** `waitlist_big_buy`<br>You asked me to wait a day on big buys. I saved it. I'll remind you tomorrow. | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Late buy, user taps Buy now | **APPROVE** `ok_override`<br>You chose to buy now. It is okay to buy. | **SAVE FOR LATER (no Buy now)** `waitlist_late_night`<br>You asked me to wait a day on buys after 9pm. I saved it. I'll remind you tomorrow. | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Big buy at night: both rules at once | **WAIT (Buy now works)** `wait_big_buy_late_night`<br>This is a big buy, and it is late. You asked me to wait on both. Wait, or buy now? | **SAVE FOR LATER (no Buy now)** `waitlist_big_buy_late_night`<br>This is a big buy, and it is late. You asked me to wait a day on both. I saved it. I'll remind you tomorrow. | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Essential ($90, noon: on the must-have list) | **APPROVE** `ok_essential`<br>This is on your must-have list. It is okay to buy. | **APPROVE** `ok_essential`<br>This is on your must-have list. It is okay to buy. | **APPROVE** `ok_essential`<br>This is on your must-have list. It is okay to buy. |
| Essential, late at night ($10, 10 PM) | **APPROVE** `ok_essential`<br>This is on your must-have list. It is okay to buy. | **APPROVE** `ok_essential`<br>This is on your must-have list. It is okay to buy. | **APPROVE** `ok_essential`<br>This is on your must-have list. It is okay to buy. |
| Saved 24 hours ago, tried again (late buy) | **APPROVE** `ok_after_wait`<br>You waited, and I checked your money. It is okay to buy. | **APPROVE** `ok_after_wait`<br>You waited, and I checked your money. It is okay to buy. | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Saved at 10 PM, tried again at noon the next day (14 hours: the late-night rule does not apply, the timer does) | **SAVE FOR LATER (no Buy now)** `waitlist_not_yet`<br>It is not time yet. I'll remind you tomorrow. | **SAVE FOR LATER (no Buy now)** `waitlist_not_yet`<br>It is not time yet. I'll remind you tomorrow. | **SAVE FOR LATER (no Buy now)** `waitlist_not_yet`<br>It is not time yet. I'll remind you tomorrow. |
| Saved 23 hours ago, tried again (late buy) | **SAVE FOR LATER (no Buy now)** `waitlist_not_yet`<br>It is not time yet. I'll remind you tomorrow. | **SAVE FOR LATER (no Buy now)** `waitlist_not_yet`<br>It is not time yet. I'll remind you tomorrow. | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Saved 24 hours ago, but it is over the weekly budget | **REFUSE** `over_budget`<br>That is more than what is left this week. I can't buy it. | **REFUSE** `over_budget`<br>That is more than what is left this week. I can't buy it. | **REFUSE** `over_budget`<br>That is more than what is left this week. I can't buy it. |

## Mixed strengths: the strictest rule that applies wins

| Situation | Decision |
|---|---|
| Big buy at night. Over-$50 rule gentle, after-9 PM rule firm | **SAVE FOR LATER (no Buy now)** `waitlist_late_night`<br>You asked me to wait a day on buys after 9pm. I saved it. I'll remind you tomorrow. |
| Big buy at night. Over-$50 rule firm, after-9 PM rule gentle | **SAVE FOR LATER (no Buy now)** `waitlist_big_buy`<br>You asked me to wait a day on big buys. I saved it. I'll remind you tomorrow. |
| Big buy at night. Over-$50 rule gentle, after-9 PM rule locked | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |
| Big buy at night. Over-$50 rule locked, after-9 PM rule firm | **REFUSE** `locked_rule`<br>You said never buy this kind of thing. To change that, edit your rule. It takes a day. |

## Hard walls: refuse, whatever the strength, Buy now, essential, or served wait

| Situation | Decision |
|---|---|
| Would use protected rent and bill money ($401 of $400 spendable) | **REFUSE** `protected_money`<br>That would use money saved for rent and bills. I can't do that. |
| Over the weekly budget ($1 over) | **REFUSE** `over_budget`<br>That is more than what is left this week. I can't buy it. |
| Seller flagged as a scam | **REFUSE** `scam_seller`<br>This seller looks like a scam. I won't pay them. |
| Started by an AI agent from untrusted listing text | **REFUSE** `untrusted_agent`<br>This buy was started by text in a listing, not by you. I won't pay for it. |
| Price can't be read ($0) | **REFUSE** `bad_amount`<br>I can't read that price, so I can't buy it. |
| A wall AND a locked rule at once (over budget, big buy) | **REFUSE** `over_budget`<br>That is more than what is left this week. I can't buy it. |

## Order of checks

1. Hard walls (refuse): unreadable price or time, scam seller, AI-started buy from untrusted text, protected money, weekly budget.
2. Must-have list (essentials): passes EVERY user rule (gentle, firm, locked, and a saved item's timer). Never the walls.
3. Locked rules (refuse): never, while the rule is on. A rule change (including loosening a lock) takes effect after 24 hours; the old rule applies until then.
4. A saved item's own timer: it can't be bought until its full wait has passed, whatever the time of day. After that it is a normal buy.
5. Firm rules: save for later. No Buy now.
6. Gentle rules: Wait, or buy now? Buy now works right away and is logged.

AI can only add caution: the only AI-fed inputs are the two flags in step 1, which can only refuse.
