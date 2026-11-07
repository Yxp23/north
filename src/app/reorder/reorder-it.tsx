"use client";
// "Buy this again": a photo of the empty item -> the 3 best matches with pictures -> one tap -> the Money Guardian
// decides -> the saved PayPal pays -> a picture receipt that says what you still have this week.
// The tap goes through the same guarded checkout as every other buy, so every rule still applies.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary } from "@/components/classes";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { ProductCard } from "@/components/product-card";
import type { StepEvent } from "@/lib/agents/loop";
import type { FinderOutcome, FoundItem } from "@/lib/agents/finder/finder";
import type { CheckoutOutcome } from "@/lib/checkout/checkout";
import { useDemoHour } from "@/lib/demo-hour";
import { postAgent } from "@/lib/ndjson-client";
import { streamCheckout } from "../shop/checkout-client";
import { CheckoutResult } from "../shop/checkout-result";

type Stage =
  | { name: "ask" }
  | { name: "looking"; events: StepEvent[] }
  | { name: "matches"; items: FoundItem[]; events: StepEvent[] }
  | { name: "none"; events: StepEvent[] }
  | { name: "buying"; item: FoundItem["item"]; events: StepEvent[]; back: FoundItem[] }
  | { name: "done"; item: FoundItem["item"]; outcome: CheckoutOutcome; events: StepEvent[]; back: FoundItem[] }
  | { name: "error"; message: string; events: StepEvent[] };

const h1 = "text-3xl font-bold outline-none";

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
    if (!p) setStage({ name: "error", message: r.error ?? "Something went wrong. Please try again.", events: r.events });
    else if (p.kind === "error") setStage({ name: "error", message: p.message, events: r.events });
    else if (p.kind === "none") setStage({ name: "none", events: r.events });
    else setStage({ name: "matches", items: p.items, events: r.events });
  }

  async function buy(item: FoundItem["item"], back: FoundItem[], overrideWait: boolean) {
    setStage({ name: "buying", item, events: [], back });
    try {
      // The price on the card goes along only so that a changed price STOPS the buy. The store sets the price.
      const { outcome, events } = await streamCheckout(
        { productId: item.id, seenCents: item.priceCents, overrideWait, pretendHour: pretendHour ?? undefined },
        (events) => setStage({ name: "buying", item, events, back }),
      );
      setStage({ name: "done", item, outcome, events, back });
    } catch {
      setStage({ name: "error", message: "Something went wrong. Nothing was bought. Please try again.", events: [] });
    }
  }

  switch (stage.name) {
    case "ask":
      return (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); look(); }}>
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Buy this again</h1>
          <p className="text-xl">Take a picture of the empty one. I will find it for you.</p>
          <PicturePicker id="reorder-picture" label="A picture of the empty item" picture={picture} onChange={setPicture} />
          <button type="submit" className={btnPrimary} disabled={!picture}>Find it</button>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </form>
      );

    case "looking":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Looking</h1>
          <p role="status" className="text-xl">This takes a few seconds.</p>
          <ActivityPanel events={stage.events} />
        </div>
      );

    case "matches":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Which one is it?</h1>
          <p className="text-xl">Tap Buy on the one that matches. The Money Guardian checks it first.</p>
          <ul className="space-y-4">
            {stage.items.map(({ item }) => (
              <li key={item.id}>
                <ProductCard item={item}>
                  <button type="button" className={btnPrimary} onClick={() => buy(item, stage.items, false)}>Buy this one</button>
                </ProductCard>
              </li>
            ))}
          </ul>
          <ActivityPanel events={stage.events} />
          <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>None of these</button>
        </div>
      );

    case "none":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>I did not find it</h1>
          <p role="status" className="text-xl">I could not match that picture. Try a clearer picture, with the label showing.</p>
          <ActivityPanel events={stage.events} />
          <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Try again</button>
        </div>
      );

    case "buying":
      return (
        <div className="space-y-4">
          <p role="status" className="text-2xl">Checking with the Money Guardian…</p>
          <ActivityPanel events={stage.events} />
        </div>
      );

    case "done":
      return (
        <CheckoutResult
          outcome={stage.outcome}
          events={stage.events}
          product={stage.item}
          headingRef={headingRef}
          onBuyNow={() => buy(stage.item, stage.back, true)}
          onBack={() => setStage({ name: "matches", items: stage.back, events: [] })}
        />
      );

    default:
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>I couldn&apos;t do that</h1>
          <p role="alert" className="text-xl">{stage.message}</p>
          <ActivityPanel events={stage.events} />
          <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Try again</button>
        </div>
      );
  }
}
