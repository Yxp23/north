"use client";
// "Buy this again": a photo of the empty item -> the 3 best matches with pictures -> one tap -> the Money Guardian
// decides -> the saved PayPal pays -> a picture receipt that says what you still have this week.
// The tap goes through the same guarded checkout as every other buy, so every rule still applies.
import { Camera, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary } from "@/components/classes";
import { CheckoutDialog, type CheckoutPhase } from "@/components/checkout-dialog";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { ProductCard } from "@/components/product-card";
import { ErrorNote, Loading } from "@/components/states";
import type { StepEvent } from "@/lib/agents/loop";
import type { FinderOutcome, FoundItem } from "@/lib/agents/finder/finder";
import { useDemoHour } from "@/lib/demo-hour";
import { postAgent } from "@/lib/ndjson-client";
import { streamCheckout } from "../shop/checkout-client";

type Stage =
  | { name: "ask" }
  | { name: "looking"; events: StepEvent[] }
  | { name: "matches"; items: FoundItem[]; events: StepEvent[] }
  | { name: "none"; events: StepEvent[] }
  | { name: "buying"; item: FoundItem["item"]; phase: CheckoutPhase; back: FoundItem[] }
  | { name: "error"; message: string; events: StepEvent[] };

const FINDER = [{ name: "Finder", ai: true, did: "Looked at your picture and matched it to products. It can only find, never buy." }];

export function ReorderIt() {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [picture, setPicture] = useState<Picture | null>(null);
  const demoHour = useDemoHour();
  const pretendHour = demoHour === "" ? null : Number(demoHour);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  async function look() {
    if (!picture) return;
    setStage({ name: "looking", events: [] });
    const r = await postAgent<FinderOutcome>("/api/find", { mode: "reorder", imageBase64: picture.base64 }, (events) => setStage({ name: "looking", events }));
    const p = r.payload;
    if (!p) setStage({ name: "error", message: r.error ?? "That did not work. Nothing was bought. Try again.", events: r.events });
    else if (p.kind === "error") setStage({ name: "error", message: p.message, events: r.events });
    else if (p.kind === "none") setStage({ name: "none", events: r.events });
    else setStage({ name: "matches", items: p.items, events: r.events });
  }

  async function buy(item: FoundItem["item"], back: FoundItem[], overrideWait: boolean) {
    setStage({ name: "buying", item, phase: { name: "working", events: [] }, back });
    try {
      // The price on the card goes along only so that a changed price STOPS the buy. The store sets the price.
      const { outcome, events } = await streamCheckout(
        { productId: item.id, seenCents: item.priceCents, overrideWait, pretendHour: pretendHour ?? undefined },
        (events) => setStage({ name: "buying", item, phase: { name: "working", events }, back }),
      );
      setStage({ name: "buying", item, phase: { name: "done", outcome, events }, back });
    } catch {
      setStage({ name: "error", message: "That did not work. Nothing was charged. Try again.", events: [] });
    }
  }

  const head = (title: string, intro?: string) => (
    <div className="ng-page-title">
      <div className="ng-eyebrow">Shop · Buy this again</div>
      <h1 ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>{title}</h1>
      {intro && <p>{intro}</p>}
    </div>
  );

  // Items stay on screen under the dialog.
  const matches = stage.name === "matches" ? stage.items : stage.name === "buying" ? stage.back : null;

  return (
    <div className="n-col" style={{ maxWidth: 720 }}>
      {stage.name === "ask" && (
        <form className="n-stack" style={{ gap: 20 }} onSubmit={(e) => { e.preventDefault(); look(); }}>
          {head("Buy this again", "Take a picture of the empty one. I will find it for you.")}
          <PicturePicker id="reorder-picture" label="A picture of the empty item" picture={picture} onChange={setPicture} />
          <button type="submit" className={btnPrimary} disabled={!picture}><Camera aria-hidden="true" />Find it</button>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </form>
      )}

      {stage.name === "looking" && (
        <div className="n-stack">
          {head("Looking")}
          <Loading what="your picture matched" />
          <ActivityPanel events={stage.events} agents={FINDER} />
        </div>
      )}

      {matches && (
        <div className="n-stack">
          {head("Which one is it?", "Tap Buy on the one that matches. The Money Guardian checks it first.")}
          <ul className="n-stack" style={{ gap: 18 }}>
            {matches.map(({ item }) => (
              <li key={item.id}>
                <ProductCard item={item}>
                  <button type="button" className={btnPrimary} onClick={() => buy(item, matches, false)}><Wallet aria-hidden="true" />Buy this one</button>
                </ProductCard>
              </li>
            ))}
          </ul>
          <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>None of these</button>
          {stage.name === "matches" && <ActivityPanel events={stage.events} agents={FINDER} />}
        </div>
      )}

      {stage.name === "none" && (
        <div className="n-stack">
          {head("I did not find it")}
          <p role="status" className="n-note n-note-quiet"><span>I could not match that picture. Try a clearer picture, with the label showing.</span></p>
          <ActivityPanel events={stage.events} agents={FINDER} />
          <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Try again</button>
        </div>
      )}

      {stage.name === "error" && (
        <div className="n-stack">
          {head("I couldn't do that")}
          <ErrorNote what="that" touched="Nothing was bought." onRetry={() => setStage({ name: "ask" })} />
          <p role="alert" className="n-note n-note-stop"><span>{stage.message}</span></p>
          <ActivityPanel events={stage.events} agents={FINDER} />
        </div>
      )}

      {stage.name === "buying" && (
        <CheckoutDialog
          phase={stage.phase}
          product={stage.item}
          onBuyNow={() => buy(stage.item, stage.back, true)}
          onClose={() => setStage({ name: "matches", items: stage.back, events: [] })}
        />
      )}
    </div>
  );
}
