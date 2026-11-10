// A real Wait decision, drawn with the real decision components. The answer is NOT typed in: North's own Guardian (decide) answers for a
// $72.54 buy under the starting rules, and the same code that words every decision in the app writes the lines. The two buttons are shown
// but cannot be pressed here: it is an example.
import { StatusBadge } from "@/components/decision-dialog";
import { SpeakButton } from "@/components/shell/speak";
import { decide } from "@/lib/guardian";
import { buildUserState, defaultLedgerData } from "@/lib/ledger/logic";
import { summarizeRules } from "@/lib/rules/summary";
import { decisionFromAnswer } from "@/lib/ui/decision-view";
import { decisionSubtitle } from "@/lib/ui/dialog-subtitle";
import type { CheckoutOutcome } from "@/lib/checkout/checkout";

const PRICE_CENTS = 7254;
const NOON = new Date("2026-11-09T17:00:00Z"); // noon in New York: only the big-buy rule applies

function realExample() {
  const data = defaultLedgerData(NOON, "America/New_York");
  const state = buildUserState(data, NOON);
  const result = decide({ amountCents: PRICE_CENTS, item: "Running shoes", category: "shoes", at: NOON }, state);
  const view = decisionFromAnswer(result);
  const outcome = { kind: "wait", result } as CheckoutOutcome;
  const rules = summarizeRules(state.rules, NOON).map((l) => ({ kind: l.kind, rule: l.rule }));
  const sub = decisionSubtitle(outcome, { name: "Running shoes", priceCents: PRICE_CENTS, rules }) ?? result.reason;
  return { view, sub, result };
}

export function DecisionCardPreview() {
  const { view, sub } = realExample();
  return (
    <figure className="lp-card" aria-label="Example of a North decision">
      <div className="lp-card-body">
        <StatusBadge view={view} />
        <h2>{view.title}</h2>
        <p className="lp-card-sub">{sub}</p>
        <div className="lp-card-hear"><SpeakButton text={`${view.word}. ${view.title}. ${sub}`} /></div>
        <p className="n-note n-note-wait"><span>No money has moved. You can wait, or you can buy it now. It is your call.</span></p>
        <div className="lp-card-actions" aria-hidden="true">
          <span className="n-btn n-btn-primary">Wait, and watch the price</span>
          <span className="n-btn n-btn-secondary">Buy now</span>
        </div>
      </div>
      <figcaption>
        A real answer from North&apos;s Guardian, live. In the app, you choose.
      </figcaption>
    </figure>
  );
}
