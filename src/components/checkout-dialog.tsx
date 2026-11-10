"use client";
// What the Money Guardian said about a buy, shown over the screen you bought from. Used after "Pay" on a product and after "Buy this again".
// While the Guardian works, the real steps stream in. Then the answer takes its place: one of the six looks.
import { ProblemNote } from "@/components/states";
import { Check, Clock, Hand } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { Disclosure } from "@/components/disclosure";
import { HowDecided } from "@/components/trace-view";
import { Dialog } from "@/components/shell/dialog";
import { RealThingsLine } from "@/components/money";
import { WatchButton } from "@/components/watch-button";
import type { StepEvent } from "@/lib/agents/loop";
import type { CheckoutOutcome } from "@/lib/checkout/checkout";
import { formatMoney } from "@/lib/format";
import { decisionSubtitle, type SubtitleFacts } from "@/lib/ui/dialog-subtitle";
import { decisionFromOutcome } from "@/lib/ui/decision-view";
import { traceFromCheckout } from "@/lib/ui/guardian-trace";
import { DecisionDialog, Row } from "./decision-dialog";

export type CheckoutProduct = { id: string; name: string; imageUrl: string; sellerDomain?: string };
const GUARDIAN: { name: string; ai: false; did: string }[] = [{ name: "Money Guardian", ai: false, did: "Checked the item, the seller and the total against your rules. Only it can approve." }];

export type CheckoutPhase = { name: "working"; events: StepEvent[] } | { name: "done"; outcome: CheckoutOutcome; events: StepEvent[] };

export function CheckoutDialog({
  phase, product, facts, onBuyNow, onClose,
}: {
  phase: CheckoutPhase;
  product: CheckoutProduct;
  /** What the subtitle needs (the price, the rules, what is left). Without it the Guardian's own sentence is shown. */
  facts?: SubtitleFacts;
  /** The person tapped "Buy now" on a wait answer. Only they can. */
  onBuyNow(): void;
  onClose(): void;
}) {
  const [undone, setUndone] = useState<"" | "done" | "failed">("");
  const [undoing, setUndoing] = useState(false);

  if (phase.name === "working") {
    return (
      <Dialog label="Checking your rules" onClose={onClose} dismissable={false} wide>
        <p className="gd-badge n-chip-quiet"><Clock aria-hidden="true" />Checking</p>
        <h2 tabIndex={-1} data-autofocus style={{ outline: "none" }}>Checking your rules</h2>
        <p role="status">I am checking {product.name} against your rules. Nothing is charged until the check says yes.</p>
        <ActivityPanel events={phase.events} title="What I am checking" agents={GUARDIAN} />
      </Dialog>
    );
  }

  const { outcome: o, events } = phase;
  const trace = traceFromCheckout(o, events);
  const panel = <HowDecided title={`Buying ${product.name}`} data={{ agents: GUARDIAN, checkout: trace, events }} />;
  const view = decisionFromOutcome(o);
  const sub = facts ? decisionSubtitle(o, facts) : null;
  // The line under the title: the person's own rule and the price when we know them. The Guardian's own words stay in "How North decided".
  const withSub = (v: NonNullable<typeof view>) => (sub ? { ...v, reason: sub } : v);
  const close = <button type="button" className="n-btn n-btn-quiet" onClick={onClose}>Back</button>;

  async function undoSave(id: string) {
    setUndoing(true);
    try {
      const res = await fetch("/api/waiting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", id }) });
      setUndone(res.ok ? "done" : "failed");
    } catch {
      setUndone("failed");
    }
    setUndoing(false);
  }

  // The Guardian answered: one of the six looks.
  if (o.kind === "paid" && view) {
    const p = o.purchase;
    return (
      <DecisionDialog view={withSub(view)} onClose={onClose} hear={`Approved. You bought ${p.name} for ${formatMoney(p.amountCents)}. You'll still have ${formatMoney(o.leftCents)} this week.`}>
        <Link href="/money" className="n-btn n-btn-primary">See my money</Link>
        <Link href="/find" className="n-btn n-btn-quiet">Keep looking</Link>
        <div className="ng-review" role="group" aria-label="Your receipt">
          <Row label="Item">{p.name}</Row>
          <Row label="Total">{formatMoney(p.amountCents)}</Row>
          <Row label="Paid with">PayPal (saved)</Row>
          <Row label="PayPal order">{trace.paypal.status ? trace.paypal.status.charAt(0) + trace.paypal.status.slice(1).toLowerCase() : "Completed"}</Row>
          <Row label="Left this week">{formatMoney(o.leftCents)}</Row>
        </div>
        <RealThingsLine cents={p.amountCents} className="gd-reason" />
        {trace.paypal.orderId && (
          <Disclosure summary="PayPal receipt numbers" className="gd-receipt">
            <div className="ng-review" style={{ margin: 0 }}>
              <Row label="Order" mono>{trace.paypal.orderId}</Row>
              {trace.paypal.captureId && <Row label="Capture" mono>{trace.paypal.captureId}</Row>}
            </div>
          </Disclosure>
        )}
        {panel}
      </DecisionDialog>
    );
  }

  if (o.kind === "wait" && view) {
    return (
      <DecisionDialog view={withSub(view)} onClose={onClose} hear={`Wait, or buy now? ${sub ?? o.result.reason}`}>
        <p className="n-note n-note-wait" style={{ margin: "0 0 14px" }}><Clock aria-hidden="true" /><span>No money has moved. You can wait, or you can buy it now. It is your call.</span></p>
        <WatchButton productId={product.id} />
        {view.canBuyNow && <button type="button" className="n-btn n-btn-secondary" onClick={onBuyNow}>Buy now</button>}
        {close}
        {panel}
      </DecisionDialog>
    );
  }

  if (o.kind === "waitlisted" && view) {
    return (
      <DecisionDialog view={withSub(view)} onClose={onClose} hear={`Saved for later. ${sub ?? o.result.reason}`}>
        {undone === "done" ? (
          <p role="status" className="n-note n-note-good"><Check aria-hidden="true" /><span>Okay. It is not on your list. Nothing was bought.</span></p>
        ) : (
          <p className="n-note n-note-quiet" style={{ margin: "0 0 14px" }}><span>I will also watch the price while you wait, and tell you on the home screen if it changes.</span></p>
        )}
        {undone === "failed" && <ProblemNote message="That did not work. It is still saved. Try again." style={{ margin: "0 0 14px" }} />}
        {undone !== "done" && <Link href="/saved" className="n-btn n-btn-primary">See my saved items</Link>}
        {undone !== "done" && (
          <button type="button" className="n-btn n-btn-quiet" disabled={undoing} onClick={() => undoSave(o.item.id)}>Undo. Don&apos;t save it.</button>
        )}
        {panel}
      </DecisionDialog>
    );
  }

  if (o.kind === "refused" && view) {
    return (
      <DecisionDialog view={withSub(view)} onClose={onClose} hear={`${view.word}. ${view.title}. ${sub ?? o.result.reason}`}>
        <p className="n-note n-note-stop" style={{ margin: "0 0 14px" }}><Hand aria-hidden="true" /><span>Nothing was charged. {view.variant === "scam" ? "I will not pay this seller, whatever anyone says." : "No one can get past this, not even a Buy now."}</span></p>
        {view.variant === "scam" && <Link href={`/check?product=${encodeURIComponent(product.id)}`} className="n-btn n-btn-quiet">See why I think it is a scam</Link>}
        {o.result.code === "locked_rule" && <Link href="/rules" className="n-btn n-btn-quiet">See my rules</Link>}
        {(o.result.code === "over_budget" || o.result.code === "protected_money") && <Link href="/money" className="n-btn n-btn-quiet">See my money</Link>}
        <Link href="/find" className="n-btn n-btn-primary">Back to Find</Link>
        {panel}
      </DecisionDialog>
    );
  }

  // Everything else is not a Guardian answer: a plain notice in the same look.
  const notice = (word: string, title: string, text: string, tone: "wait" | "stop", actions: React.ReactNode) => (
    <DecisionDialog view={{ tone, icon: tone === "stop" ? "hand" : "clock", word, title, reason: text }} onClose={onClose}>
      {actions}
      {panel}
    </DecisionDialog>
  );
  switch (o.kind) {
    case "price_changed":
      return notice("Price changed", "The price changed", `It was ${formatMoney(o.seenCents)}. Now it is ${formatMoney(o.nowCents)}. I did not buy it. Nothing was charged.`, "wait", (
        <button type="button" className="n-btn n-btn-primary" onClick={() => window.location.reload()}>Look again</button>
      ));
    case "needs_paypal":
      return notice("Connect PayPal", "Connect PayPal first", "This is okay to buy, but PayPal is not connected yet. Nothing was charged.", "wait", (
        <Link href="/connect" className="n-btn n-btn-primary">Connect PayPal</Link>
      ));
    case "failed":
      return notice("Did not go through", "It did not go through", o.message, "stop", <button type="button" className="n-btn n-btn-primary" onClick={onClose}>Back</button>);
    case "in_progress":
      return notice("Almost done", "Almost done", "Your buy is still going. Check My money in a moment.", "wait", <Link href="/money" className="n-btn n-btn-primary">See my money</Link>);
    default:
      return notice("Not found", "I could not find that", "It may be sold out now. Nothing was charged.", "stop", <Link href="/find" className="n-btn n-btn-primary">Back to Find</Link>);
  }
}
