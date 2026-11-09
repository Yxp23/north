"use client";
// "Is this deal real?" One decision per screen:
//   paste a link / type the ad / add a picture -> (one question if the price is missing) -> the verdict.
// The verdict and every price in it are written by code from store facts (see lib/dealcheck/verdict.ts).
// The AI only reads the ad and finds the product. The activity panel shows each step in plain words.
import { CircleCheck, Hand, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { DecisionDialog, Row } from "@/components/decision-dialog";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { ErrorNote } from "@/components/states";
import { HowDecided } from "@/components/trace-view";
import type { StepEvent } from "@/lib/agents/loop";
import type { DealPayload } from "@/lib/agents/scam-checker/scam-checker";
import { formatMoney } from "@/lib/format";
import { readNdjson } from "@/lib/ndjson-client";

type Flagged = "yes" | "no_seller" | "not_saved" | "no";
type Verdict = Extract<DealPayload, { kind: "verdict" }>;
type Stage =
  | { name: "ask" }
  | { name: "thinking"; events: StepEvent[] }
  | { name: "price"; question: string; events: StepEvent[] }
  | { name: "verdict"; payload: Verdict; flagged: Flagged; events: StepEvent[] }
  | { name: "error"; message: string; events: StepEvent[] };


const LOOK: Record<Verdict["verdict"]["kind"], { Icon: LucideIcon; word: string; box: string }> = {
  fine: { Icon: CircleCheck, word: "Looks fine", box: "n-note-good" },
  careful: { Icon: TriangleAlert, word: "Be careful", box: "n-note-wait" },
  scam: { Icon: ShieldAlert, word: "Looks like a scam", box: "n-note-stop" },
};

const SCAM_CHECKER = [{ name: "Scam checker", ai: true, did: "Read the ad and found the matching listing. Code worked out the verdict from real prices." }];

export function CheckDeal({ prefill }: { prefill: string }) {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState(prefill);
  const [price, setPrice] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [showScam, setShowScam] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  async function check(priceText = price) {
    const events: StepEvent[] = [];
    const show = (s: Stage) => setStage(s);
    show({ name: "thinking", events: [] });
    const dollars = Number(priceText);
    try {
      const res = await fetch("/api/deal-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          imageBase64: picture?.base64,
          priceDollars: priceText.trim() && Number.isFinite(dollars) && dollars > 0 ? dollars : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        return show({ name: "error", message: j?.error ?? "That did not work. Nothing was bought. Try again.", events });
      }
      let payload: DealPayload | null = null;
      let flagged: Flagged = "no";
      await readNdjson(res, (line) => {
        if (line.type === "step") {
          events.push({ label: String(line.label), state: line.state as StepEvent["state"], detail: line.detail as string | undefined, warn: line.warn as boolean | undefined });
          show({ name: "thinking", events: [...events] });
        } else if (line.type === "result") {
          payload = line.payload as DealPayload;
          flagged = (line.flagged as Flagged | undefined) ?? "no";
        }
      });
      const p = payload as DealPayload | null;
      if (!p) show({ name: "error", message: "That did not work. Nothing was bought. Try again.", events });
      else if (p.kind === "error") show({ name: "error", message: p.message, events });
      else if (p.kind === "needs_price") show({ name: "price", question: p.question, events });
      else {
        show({ name: "verdict", payload: p, flagged, events });
        setShowScam(p.verdict.kind === "scam");
      }
    } catch {
      show({ name: "error", message: "That did not work. Nothing was bought. Try again.", events });
    }
  }

  function startOver() {
    setText("");
    setPrice("");
    setPicture(null);
    setShowScam(false);
    setStage({ name: "ask" });
  }

  const head = (title: string, intro?: string) => (
    <div className="ng-page-title">
      <div className="ng-eyebrow">Find · Check a deal</div>
      <h1 ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>{title}</h1>
      {intro && <p>{intro}</p>}
    </div>
  );

  let body: React.ReactNode = null;
  switch (stage.name) {
    case "ask":
      body = (
        <form
          className="n-stack"
          style={{ gap: 20 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() || picture) check();
          }}
        >
          {head("Is this deal real?", "Found a deal? I will check it for you. I will not buy anything.")}
          <label className="block">
            <span className="n-label">Paste a link, or type what the ad says</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} className="n-field" placeholder="70% off sneakers, $27" />
          </label>
          <PicturePicker id="ad-picture" label="Or add a picture of the ad" picture={picture} onChange={setPicture} />
          <label className="block">
            <span className="n-label">What price does the ad say? (if you know)</span>
            <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="n-field" placeholder="27" />
          </label>
          <button type="submit" className={btnPrimary} disabled={!text.trim() && !picture}>Check this deal</button>
          <Link href="/find" className={btnSecondary}>Back to Find</Link>
        </form>
      );
      break;

    case "thinking":
      body = (
        <div className="n-stack">
          {head("Checking the deal")}
          <p role="status" className="n-note n-note-quiet"><span>This takes a few seconds. Nothing is bought.</span></p>
          <ActivityPanel events={stage.events} agents={SCAM_CHECKER} />
        </div>
      );
      break;

    case "price":
      body = (
        <form className="n-stack" onSubmit={(e) => { e.preventDefault(); if (Number(price) > 0) check(price); }}>
          {head(stage.question, "I couldn't find a price in the ad. Type it here and I will check again.")}
          <label className="block">
            <span className="n-label">Price in dollars</span>
            <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="n-field" />
          </label>
          <ActivityPanel events={stage.events} agents={SCAM_CHECKER} />
          <button type="submit" className={btnPrimary} disabled={!(Number(price) > 0)}>Check again</button>
          <button type="button" className={btnSecondary} onClick={startOver}>Start over</button>
        </form>
      );
      break;

    case "error":
      body = (
        <div className="n-stack">
          {head("I couldn't check that")}
          <ErrorNote what="that deal" touched="Nothing was bought." onRetry={() => setStage({ name: "ask" })} />
          <p role="alert" className="n-note n-note-stop"><span>{stage.message}</span></p>
          <Link href="/find" className={btnSecondary}>Back to Find</Link>
        </div>
      );
      break;

    case "verdict": {
      const { payload, flagged } = stage;
      const look = LOOK[payload.verdict.kind];
      const [main, ...rest] = payload.verdict.reasons;
      const scam = payload.verdict.kind === "scam";
      body = (
        <div className="n-stack">
          <div className={`n-note ${look.box}`} style={{ padding: 22, borderRadius: 23 }}>
            <look.Icon aria-hidden="true" size={30} />
            <div className="n-stack" style={{ gap: 8 }}>
              <p className="n-chip" style={{ padding: 0, background: "none" }}>{look.word}</p>
              <h1 ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>{payload.verdict.headline}</h1>
              <p className="text-xl">{main}</p>
            </div>
          </div>
          {rest.length > 0 && <ul className="list-disc space-y-1 pl-6 text-lg">{rest.map((r) => <li key={r}>{r}</li>)}</ul>}
          {flagged === "yes" && payload.sellerDomain && (
            <p role="status" className="n-note n-note-stop"><Hand aria-hidden="true" /><span><strong>I will not let you pay {payload.sellerDomain}.</strong> North will say no when you try to pay them.</span></p>
          )}
          {flagged === "no_seller" && <p role="status" className="n-note n-note-wait"><span>I don&apos;t know who the seller is, so I couldn&apos;t block them.</span></p>}
          {flagged === "not_saved" && <p role="alert" className="n-note n-note-wait"><span>I couldn&apos;t save a warning about this seller. Please be careful.</span></p>}
          <section aria-label="What I looked at" className={`${card} n-stack`} style={{ gap: 8 }}>
            <h2 style={{ fontSize: 18 }} className="text-muted">What I looked at</h2>
            <ul className="space-y-1 text-lg">
              {payload.productTitle && <li>Product: {payload.productTitle}</li>}
              {payload.verdict.evidence.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </section>
          {payload.claimSource === "picture" && (
            <p className="text-lg">I read the price from your picture: {formatMoney(payload.claimedCents)}. If that is wrong, type the price and check again.</p>
          )}
          <ActivityPanel events={stage.events} agents={SCAM_CHECKER} guardian={scam && flagged === "yes" ? { decision: "refuse", code: "scam_seller", reason: "This seller looks like a scam. I won't pay them." } : undefined} />
          {payload.claimSource === "picture" && <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>Type the price myself</button>}
          <button type="button" className={btnPrimary} onClick={startOver}>Check another deal</button>
          <Link href="/find" className={btnSecondary}>Back to Find</Link>
          {scam && showScam && (
            <DecisionDialog
              view={{ tone: "stop", icon: "shield-alert", word: "Scam stopped", title: "I will not pay this seller", reason: main }}
              onClose={() => setShowScam(false)} wide
              hear={`Scam stopped. ${main}`}
            >
              <div className="gd-evidence" role="group" aria-label="What I found">
                {payload.productTitle && <Row label="Product">{payload.productTitle}</Row>}
                <Row label="The ad says">{formatMoney(payload.claimedCents)}</Row>
                {payload.sellerDomain && <Row label="Seller">{payload.sellerDomain}</Row>}
              </div>
              <h3 style={{ margin: "0 0 8px" }}>Real prices I checked</h3>
              <ul className="list-disc space-y-1 pl-6" style={{ margin: "0 0 14px", color: "var(--n-ink)" }}>
                {payload.verdict.evidence.map((e) => <li key={e}>{e}</li>)}
              </ul>
              {flagged === "yes" && <p className="n-note n-note-stop" style={{ margin: "0 0 14px" }}><Hand aria-hidden="true" /><span>I saved a warning about this seller. North will refuse to pay them.</span></p>}
              <HowDecided title="Checking a deal" data={{ agents: [...SCAM_CHECKER, { name: "Money Guardian", ai: false, did: "Refuses to pay a seller that was flagged as a scam." }], guardian: flagged === "yes" ? { decision: "refuse", code: "scam_seller", reason: "This seller looks like a scam. I won't pay them." } : undefined, events: stage.events }} />
              <button type="button" className="n-btn n-btn-primary" data-autofocus onClick={() => setShowScam(false)}>Okay, I understand</button>
            </DecisionDialog>
          )}
        </div>
      );
      break;
    }
  }
  return <div className="n-col" style={{ maxWidth: 720 }}>{body}</div>;
}
