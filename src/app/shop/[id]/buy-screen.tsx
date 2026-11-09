"use client";
// One decision per screen: look, Buy this, review the item, seller and total, then the Guardian's answer (paid / wait / saved / stopped).
// The price on screen comes from the store. The reason text comes from the Guardian. Every action shows its steps, in plain words.
import { Bot, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { CheckoutDialog, type CheckoutPhase } from "@/components/checkout-dialog";
import { DecisionDialog, Row } from "@/components/decision-dialog";
import { BigMoney, RealThingsLine } from "@/components/money";
import { Dialog } from "@/components/shell/dialog";
import { SpeakButton } from "@/components/shell/speak";
import { ErrorNote } from "@/components/states";
import { StoreComparison } from "@/components/store-comparison";
import type { StepEvent } from "@/lib/agents/loop";
import { useDemoHour } from "@/lib/demo-hour";
import { formatMoney } from "@/lib/format";
import { readNdjson } from "@/lib/ndjson-client";
import type { StoreProduct } from "@/lib/store";
import { streamCheckout, toStep } from "../checkout-client";

type HelperResult = {
  summary: string | null;
  hidden: { productName: string }[];
  judged: { plain: string; productName?: string; quantity: number; amountCents?: number; code?: string; reason?: string }[];
  error?: string;
};

type Screen =
  | { name: "ready" }
  | { name: "review" }
  | { name: "checkout"; phase: CheckoutPhase }
  | { name: "error" }
  | { name: "helper"; events: StepEvent[]; result?: HelperResult; pretend: boolean };

const HELPER: { name: string; ai: boolean; did: string }[] = [
  { name: "Concierge", ai: true, did: "Read the listing as data and wrote a short summary. It can only suggest." },
  { name: "Money Guardian", ai: false, did: "Judged any buy the listing's text started. A buy started by listing text is always refused." },
];

export function BuyScreen({ product, demoMode }: { product: StoreProduct; demoMode: boolean }) {
  const [screen, setScreen] = useState<Screen>({ name: "ready" });
  const [left, setLeft] = useState<number | null>(null);
  const demoHour = useDemoHour();
  const pretendHour = demoHour === "" ? null : Number(demoHour);
  const seller = product.offers?.[0]?.domain ?? product.sellerDomain;

  // What is left this week, to show before paying (read from the server, never typed in by the browser).
  useEffect(() => {
    if (screen.name !== "review") return;
    let alive = true;
    fetch("/api/summary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && typeof j?.leftCents === "number" && setLeft(j.leftCents))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [screen.name]);

  async function buy(overrideWait: boolean) {
    setScreen({ name: "checkout", phase: { name: "working", events: [] } });
    try {
      // The price on screen goes along only so that a changed price STOPS the buy. The store sets the price.
      const { outcome, events } = await streamCheckout(
        { productId: product.id, seenCents: product.priceCents, overrideWait, pretendHour: pretendHour ?? undefined },
        (events) => setScreen({ name: "checkout", phase: { name: "working", events } }),
      );
      setScreen({ name: "checkout", phase: { name: "done", outcome, events } });
    } catch {
      setScreen({ name: "error" });
    }
  }

  async function askHelper(pretend: boolean) {
    const events: StepEvent[] = [];
    const show = (result?: HelperResult) => setScreen({ name: "helper", events: [...events], result, pretend });
    show();
    try {
      const res = await fetch("/api/concierge/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, pretendTricked: pretend }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        return show({ summary: null, hidden: [], judged: [], error: j?.error ?? "That did not work. Nothing was bought. Try again." });
      }
      let result: HelperResult | null = null;
      await readNdjson(res, (line) => {
        if (line.type === "step") {
          events.push(toStep(line));
          show();
        } else if (line.type === "result") result = line.payload as HelperResult;
      });
      show(result ?? { summary: null, hidden: [], judged: [], error: "That did not work. Nothing was bought. Try again." });
    } catch {
      show({ summary: null, hidden: [], judged: [], error: "That did not work. Nothing was bought. Try again." });
    }
  }

  const back = () => setScreen({ name: "ready" });
  const hear = `${product.name}. ${formatMoney(product.priceCents)}.`;

  return (
    <>
      <div className="ng-split" style={{ gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <div className="n-stack" style={{ gap: 18 }}>
          <div>
            <div className="ng-eyebrow">Shop</div>
            <h1>{product.name}</h1>
          </div>
          {pretendHour !== null && (
            <p role="note" className="n-note n-note-wait"><TriangleAlert aria-hidden="true" /><span>Demo clock: pretending it is {pretendHour % 12 === 0 ? 12 : pretendHour % 12}:00 {pretendHour >= 12 ? "PM" : "AM"}.</span></p>
          )}
          <div className={`${card} n-stack`} style={{ justifyItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} style={{ height: 260, width: "100%", objectFit: "contain", background: "#fff", borderRadius: 16 }} />
          </div>
          <div className="ng-money" style={{ minHeight: 0 }}>
            <div className="ng-money-top"><span>Price</span><Wallet aria-hidden="true" /></div>
            <BigMoney cents={product.priceCents} label="Price" />
            <RealThingsLine cents={product.priceCents} />
            <SpeakButton text={hear} />
          </div>
        </div>

        <div className="n-stack" style={{ gap: 18 }}>
          <StoreComparison offers={product.offers} live={product.live} />
          <p className="n-note n-note-quiet"><ShieldCheck aria-hidden="true" /><span>You pay with your saved PayPal. The Money Guardian checks your rules first.</span></p>
          <button type="button" className={btnPrimary} onClick={() => setScreen({ name: "review" })}>Buy this</button>
          <button type="button" className={btnSecondary} onClick={() => askHelper(false)}><Bot aria-hidden="true" />Ask the helper about this</button>
          <Link href={`/check?product=${encodeURIComponent(product.id)}`} className={btnSecondary}>Is this deal real?</Link>
          <Link href="/shop" className="n-btn n-btn-quiet">Back to the shop</Link>
          {screen.name === "error" && <ErrorNote what="your answer" touched="Nothing was charged." onRetry={back} />}
        </div>
      </div>

      {screen.name === "review" && (
        <Dialog label="Check before you pay" onClose={back}>
          <h2 data-autofocus tabIndex={-1} style={{ outline: "none" }}>Check before you pay</h2>
          <div className="ng-review" role="group" aria-label="Your buy">
            <Row label="Item">{product.name}</Row>
            <Row label="Seller">{seller ?? "North practice shop"}</Row>
            <Row label="Total">{formatMoney(product.priceCents)}</Row>
            <Row label="Pay with">PayPal, your saved account</Row>
            {left !== null && <Row label="You would still have">{formatMoney(Math.max(0, left - product.priceCents))} this week</Row>}
          </div>
          <RealThingsLine cents={product.priceCents} className="gd-reason" />
          <p>The Money Guardian checks this against your rules first. If it says yes, your PayPal is charged. If not, nothing is charged.</p>
          <div style={{ margin: "0 0 14px" }}><SpeakButton text={`Check before you pay. ${product.name}. Total ${formatMoney(product.priceCents)}. Pay with your saved PayPal.`} /></div>
          <button type="button" className={btnPrimary} onClick={() => buy(false)}><Wallet aria-hidden="true" />Pay with your saved PayPal</button>
          <button type="button" className="n-btn n-btn-quiet" onClick={back}>Not now</button>
        </Dialog>
      )}

      {screen.name === "checkout" && (
        <CheckoutDialog
          phase={screen.phase}
          product={{ id: product.id, name: product.name, imageUrl: product.imageUrl, sellerDomain: seller }}
          onBuyNow={() => buy(true)}
          onClose={back}
        />
      )}

      {screen.name === "helper" && <HelperDialog product={product} screen={screen} demoMode={demoMode} onAgain={() => askHelper(true)} onClose={back} />}
    </>
  );
}

// "Ask the helper about this": the Concierge reads the listing as DATA. If hidden instructions try to make it buy, the Guardian refuses.
function HelperDialog({ product, screen, demoMode, onAgain, onClose }: {
  product: StoreProduct;
  screen: Extract<Screen, { name: "helper" }>;
  demoMode: boolean;
  onAgain(): void;
  onClose(): void;
}) {
  const r = screen.result;
  const stopped = r?.judged[0];
  const panel = <ActivityPanel events={screen.events} title={r ? "What the helper did" : "What the helper is doing"} agents={HELPER} guardian={stopped?.code ? { decision: "refuse", code: stopped.code, reason: stopped.reason ?? stopped.plain } : undefined} />;

  if (!r) {
    return (
      <Dialog label="The helper is looking" onClose={onClose} dismissable={false} wide>
        <h2 data-autofocus tabIndex={-1} style={{ outline: "none" }}>The helper is looking</h2>
        <p role="status">Looking at {product.name}. One moment.</p>
        {panel}
      </Dialog>
    );
  }
  if (stopped) {
    return (
      <DecisionDialog
        view={{ tone: "stop", icon: "bot", word: "Assistant stopped", title: "A listing tried to trick an assistant", reason: stopped.plain }}
        onClose={onClose} wide
        hear={`Assistant stopped. A listing tried to trick an assistant. ${stopped.plain}`}
      >
        <p className="n-note n-note-stop" style={{ margin: "0 0 14px" }}><TriangleAlert aria-hidden="true" /><span>Nothing was charged. The hidden words in the listing are not from you, so no one has to follow them.</span></p>
        <div className="gd-evidence">
          <Row label="Product">{product.name}</Row>
          <Row label="Started by">Text in the listing, not you</Row>
          <Row label="Money Guardian">Refused{stopped.code ? ` (${stopped.code})` : ""}</Row>
        </div>
        {demoMode && screen.pretend && <p className="n-note n-note-wait" style={{ margin: "0 0 14px" }}><span>This was a pretend test: a scripted AI that was fooled on purpose. The Guardian stopped it anyway.</span></p>}
        {demoMode && !screen.pretend && <button type="button" className={btnSecondary} onClick={onAgain}>Demo: run it again, pretending the AI is tricked</button>}
        <button type="button" className="n-btn n-btn-primary" onClick={onClose}>Back</button>
        {panel}
      </DecisionDialog>
    );
  }
  return (
    <Dialog label="What the helper found" onClose={onClose} wide>
      <h2 data-autofocus tabIndex={-1} style={{ outline: "none" }}>What the helper found</h2>
      {r.error ? (
        <p role="alert" className="n-note n-note-stop"><span>{r.error}</span></p>
      ) : (
        <>
          <div className="ng-review">
            <p style={{ margin: 0 }}><strong>{product.name}</strong></p>
            <p style={{ margin: "6px 0 0", color: "var(--n-ink)" }}>{r.summary ?? "I could not write a short summary for this one."}</p>
            <p style={{ margin: "6px 0 0", fontSize: 23 }}>{formatMoney(product.priceCents)}</p>
          </div>
          {r.hidden.length > 0 && (
            <p role="alert" className="n-note n-note-wait" style={{ margin: "0 0 14px" }}><TriangleAlert aria-hidden="true" /><span>I found hidden instructions in this listing. They are not from you, so I do not follow them.</span></p>
          )}
        </>
      )}
      {demoMode && <button type="button" className={btnSecondary} onClick={onAgain}>Demo: run it again, pretending the AI is tricked</button>}
      <button type="button" className="n-btn n-btn-primary" onClick={onClose}>Back</button>
      {panel}
    </Dialog>
  );
}
