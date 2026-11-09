"use client";
// One decision per screen: look, Buy this, review the item, seller and total, then the Guardian's answer (paid / wait / saved / stopped).
// The price on screen comes from the store. The reason text comes from the Guardian. Every action shows its steps, in plain words.
import { Photo } from "@/components/photo";
import { Bot, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { BuyFlow } from "@/components/buy-flow";
import { DecisionDialog, Row } from "@/components/decision-dialog";
import { BigMoney, RealThingsLine } from "@/components/money";
import { Dialog } from "@/components/shell/dialog";
import { useMask } from "@/components/shell/mask";
import { SpeakButton } from "@/components/shell/speak";
import { StoreComparison } from "@/components/store-comparison";
import { HowDecided } from "@/components/trace-view";
import type { StepEvent } from "@/lib/agents/loop";
import { useDemoHour } from "@/lib/demo-hour";
import { formatMoney } from "@/lib/format";
import { readNdjson } from "@/lib/ndjson-client";
import type { StoreProduct } from "@/lib/store";
import { toStep } from "../checkout-client";

type HelperResult = {
  summary: string | null;
  hidden: { productName: string }[];
  judged: { plain: string; productName?: string; quantity: number; amountCents?: number; code?: string; reason?: string }[];
  error?: string;
};

type Screen =
  | { name: "ready" }
  | { name: "buy" }
  | { name: "helper"; events: StepEvent[]; result?: HelperResult; pretend: boolean };

const HELPER: { name: string; ai: boolean; did: string }[] = [
  { name: "Concierge", ai: true, did: "Read the listing as data and wrote a short summary. It can only suggest." },
  { name: "Money Guardian", ai: false, did: "Judged any buy the listing's text started. A buy started by listing text is always refused." },
];

export function BuyScreen({ product, demoMode }: { product: StoreProduct; demoMode: boolean }) {
  const [screen, setScreen] = useState<Screen>({ name: "ready" });
  const demoHour = useDemoHour();
  const pretendHour = demoHour === "" ? null : Number(demoHour);
  const m = useMask();
  const seller = product.offers?.[0]?.domain ?? product.sellerDomain;
  const shownName = m.item(product.name, product.category);

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
  const hear = `${shownName}. ${formatMoney(product.priceCents)}.`;

  return (
    <>
      <div className="ng-split ng-buy-split" style={{ gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <div className="n-stack" style={{ gap: 18 }}>
          <div className="ng-b-title">
            <div className="ng-eyebrow">Find</div>
            <h1>{shownName}</h1>
          </div>
          {pretendHour !== null && (
            <p role="note" className="n-note n-note-wait"><TriangleAlert aria-hidden="true" /><span>Demo clock: pretending it is {pretendHour % 12 === 0 ? 12 : pretendHour % 12}:00 {pretendHour >= 12 ? "PM" : "AM"}.</span></p>
          )}
          <div className={`${card} n-stack ng-b-photo`} style={{ justifyItems: "center" }}>
            <Photo src={product.imageUrl} alt={shownName} style={{ height: 260, width: "100%", objectFit: "contain", background: "#fff", borderRadius: 16 }} />
          </div>
          <div className="ng-money ng-b-price" style={{ minHeight: 0 }}>
            <div className="ng-money-top"><span>Price</span><Wallet aria-hidden="true" /></div>
            <BigMoney cents={product.priceCents} label="Price" />
            <RealThingsLine cents={product.priceCents} />
            <SpeakButton text={hear} />
          </div>
        </div>

        <div className="n-stack" style={{ gap: 18 }}>
          <div className="ng-b-stores"><StoreComparison offers={product.offers} live={product.live} /></div>
          <div className="n-stack ng-b-actions" style={{ gap: 18 }}>
          <p className="n-note n-note-quiet"><ShieldCheck aria-hidden="true" /><span>You pay with your saved PayPal. North checks your rules first.</span></p>
          <button type="button" className={btnPrimary} onClick={() => setScreen({ name: "buy" })}>Buy this</button>
          <button type="button" className={btnSecondary} onClick={() => askHelper(false)}><Bot aria-hidden="true" />Ask the helper about this</button>
          <Link href={`/check?product=${encodeURIComponent(product.id)}`} className={btnSecondary}>Is this deal real?</Link>
          <Link href="/find" className="n-btn n-btn-quiet">Back to Find</Link>
          </div>
        </div>
      </div>

      {screen.name === "buy" && <BuyFlow item={{ id: product.id, name: product.name, imageUrl: product.imageUrl, priceCents: product.priceCents, seller, category: product.category }} onClose={back} />}

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
  const m = useMask();
  const nm = m.item(product.name, product.category);
  const r = screen.result;
  const stopped = r?.judged[0];
  const panel = <ActivityPanel events={screen.events} title={r ? "What the helper did" : "What the helper is doing"} agents={HELPER} guardian={stopped?.code ? { decision: "refuse", code: stopped.code, reason: stopped.reason ?? stopped.plain } : undefined} />;

  if (!r) {
    return (
      <Dialog label="The helper is looking" onClose={onClose} dismissable={false} wide>
        <h2 data-autofocus tabIndex={-1} style={{ outline: "none" }}>The helper is looking</h2>
        <p role="status">Looking at {nm}. One moment.</p>
        {panel}
      </Dialog>
    );
  }
  if (stopped) {
    return (
      <DecisionDialog
        view={{ tone: "stop", icon: "bot", word: "Assistant stopped", title: "A listing tried to trick an assistant", reason: m.sentence(stopped.plain, product.name, product.category) }}
        onClose={onClose} wide
        hear={`Assistant stopped. A listing tried to trick an assistant. ${m.sentence(stopped.plain, product.name, product.category)}`}
      >
        <p className="n-note n-note-stop" style={{ margin: "0 0 14px" }}><TriangleAlert aria-hidden="true" /><span>Nothing was charged. The hidden words in the listing are not from you, so no one has to follow them.</span></p>
        <div className="gd-evidence">
          <Row label="Product">{nm}</Row>
          <Row label="Started by">Text in the listing, not you</Row>
          <Row label="Money Guardian">Refused{stopped.code ? ` (${stopped.code})` : ""}</Row>
        </div>
        {demoMode && screen.pretend && <p className="n-note n-note-wait" style={{ margin: "0 0 14px" }}><span>This was a pretend test: a scripted AI that was fooled on purpose. The Guardian stopped it anyway.</span></p>}
        {demoMode && !screen.pretend && <button type="button" className={btnSecondary} onClick={onAgain}>Demo: run it again, pretending the AI is tricked</button>}
        <button type="button" className="n-btn n-btn-primary" onClick={onClose}>Back</button>
        <HowDecided title={`Asking the helper about ${nm}`} data={{ agents: HELPER, guardian: { decision: "refuse", code: stopped.code ?? "untrusted_agent", reason: stopped.reason ?? stopped.plain }, events: screen.events }} />
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
            <p style={{ margin: 0 }}><strong>{nm}</strong></p>
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
