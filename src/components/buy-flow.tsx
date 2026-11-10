"use client";
// Buying, in three steps over whatever screen you were on: check before you pay, the Money Guardian's streamed steps, then its answer.
// The price on screen goes along only so that a changed price STOPS the buy. The store sets the price, and only the Guardian can approve.
import { useRateLimited } from "@/lib/ui/rate-limit-client";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { btnPrimary } from "@/components/classes";
import { CheckoutDialog, type CheckoutPhase } from "@/components/checkout-dialog";
import { Row } from "@/components/decision-dialog";
import { RealThingsLine } from "@/components/money";
import { Dialog } from "@/components/shell/dialog";
import { useMask } from "@/components/shell/mask";
import { SpeakButton } from "@/components/shell/speak";
import { ErrorNote } from "@/components/states";
import type { RuleFact } from "@/lib/ui/dialog-subtitle";
import { useDemoHour } from "@/lib/demo-hour";
import { formatMoney } from "@/lib/format";
import { streamCheckout } from "@/app/shop/checkout-client";

export type BuyItem = { id: string; name: string; imageUrl: string; priceCents: number; seller?: string; category?: string };

export function BuyFlow({ item, onClose }: { item: BuyItem; onClose(): void }) {
  const [screen, setScreen] = useState<{ name: "review" } | { name: "checkout"; phase: CheckoutPhase } | { name: "error" }>({ name: "review" });
  const [left, setLeft] = useState<number | null>(null);
  const [rules, setRules] = useState<RuleFact[] | null>(null);
  const demoHour = useDemoHour();
  const pretendHour = demoHour === "" ? null : Number(demoHour);
  const m = useMask();
  const busy = useRateLimited();
  const shownName = m.item(item.name, item.category);

  // What is left this week, to show before paying (read from the server, never typed in by the browser).
  useEffect(() => {
    let alive = true;
    fetch("/api/summary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && typeof j?.leftCents === "number" && setLeft(j.leftCents))
      .catch(() => undefined);
    // The rules in force, so a decision can say what the person asked for ("buys over $50").
    fetch("/api/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && Array.isArray(j?.rules) && setRules(j.rules.map((l: { kind: RuleFact["kind"]; rule?: RuleFact["rule"] }) => ({ kind: l.kind, rule: l.rule }))))
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  async function buy(overrideWait: boolean) {
    setScreen({ name: "checkout", phase: { name: "working", events: [] } });
    try {
      const { outcome, events } = await streamCheckout(
        { productId: item.id, seenCents: item.priceCents, overrideWait, pretendHour: pretendHour ?? undefined },
        (events) => setScreen({ name: "checkout", phase: { name: "working", events } }),
      );
      setScreen({ name: "checkout", phase: { name: "done", outcome, events } });
    } catch {
      setScreen({ name: "error" });
    }
  }

  if (screen.name === "checkout") {
    return (
      <CheckoutDialog
        phase={screen.phase} product={{ id: item.id, name: shownName, imageUrl: item.imageUrl, sellerDomain: item.seller }}
        facts={{ name: shownName, priceCents: item.priceCents, leftCents: left, rules, seller: item.seller ? m.store(item.seller) : null }}
        onBuyNow={() => buy(true)} onClose={onClose}
      />
    );
  }
  if (screen.name === "error") {
    return (
      <Dialog label={busy ? "Please wait a moment" : "That did not work"} onClose={onClose}>
        <h2 data-autofocus tabIndex={-1} style={{ outline: "none" }}>{busy ? "Please wait a moment" : "That did not work"}</h2>
        <ErrorNote what="your answer" touched="Nothing was charged." onRetry={() => setScreen({ name: "review" })} />
        <button type="button" className="n-btn n-btn-quiet" onClick={onClose}>Back</button>
      </Dialog>
    );
  }
  return (
    <Dialog label="Check before you pay" onClose={onClose}>
      <h2 data-autofocus tabIndex={-1} style={{ outline: "none" }}>Check before you pay</h2>
      <div className="ng-review" role="group" aria-label="Your buy">
        <Row label="Item">{shownName}</Row>
        <Row label="Seller">{item.seller ? m.store(item.seller) : "North practice shop"}</Row>
        <Row label="Total">{formatMoney(item.priceCents)}</Row>
        <Row label="Pay with">PayPal, your saved account</Row>
        {left !== null && <Row label="You would still have">{formatMoney(Math.max(0, left - item.priceCents))} this week</Row>}
      </div>
      <RealThingsLine cents={item.priceCents} className="gd-reason" />
      <p>North checks this against your rules first. If your rules say yes, your PayPal is charged. If not, nothing is charged.</p>
      <div style={{ margin: "0 0 14px" }}><SpeakButton text={`Check before you pay. ${shownName}. Total ${formatMoney(item.priceCents)}. Pay with your saved PayPal.`} /></div>
      <button type="button" className={btnPrimary} onClick={() => buy(false)}><Wallet aria-hidden="true" />Pay with your saved PayPal</button>
      <button type="button" className="n-btn n-btn-quiet" onClick={onClose}>Not now</button>
    </Dialog>
  );
}
