"use client";
// "Find something": words or a photo -> products. The Finder only finds; to buy, open a product (that goes through the Guardian).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary } from "@/components/classes";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { ProductCard } from "@/components/product-card";
import type { StepEvent } from "@/lib/agents/loop";
import type { FinderOutcome } from "@/lib/agents/finder/finder";
import { postAgent } from "@/lib/ndjson-client";

type Stage =
  | { name: "ask" }
  | { name: "thinking"; events: StepEvent[] }
  | { name: "results"; outcome: Extract<FinderOutcome, { kind: "found" }>; events: StepEvent[] }
  | { name: "none"; events: StepEvent[] }
  | { name: "error"; message: string; events: StepEvent[] };

const h1 = "text-3xl font-bold outline-none";
const field = "min-h-14 w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg";

export function FindIt() {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  async function find() {
    setStage({ name: "thinking", events: [] });
    const r = await postAgent<FinderOutcome>("/api/find", { text, imageBase64: picture?.base64 }, (events) => setStage({ name: "thinking", events }));
    const p = r.payload;
    if (!p) setStage({ name: "error", message: r.error ?? "Something went wrong. Please try again.", events: r.events });
    else if (p.kind === "error") setStage({ name: "error", message: p.message, events: r.events });
    else if (p.kind === "none") setStage({ name: "none", events: r.events });
    else setStage({ name: "results", outcome: p, events: r.events });
  }

  if (stage.name === "ask") {
    return (
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (text.trim() || picture) find(); }}>
        <h1 ref={headingRef} tabIndex={-1} className={h1}>Find something</h1>
        <p className="text-xl">Tell me what you are looking for, or show me a picture.</p>
        <label className="block space-y-2">
          <span className="block text-xl font-semibold">What are you looking for?</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} className={field} placeholder="running shoes, size 8" />
        </label>
        <PicturePicker id="find-picture" label="Or add a picture of it" picture={picture} onChange={setPicture} />
        <button type="submit" className={btnPrimary} disabled={!text.trim() && !picture}>Find it</button>
        <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
      </form>
    );
  }

  if (stage.name === "thinking") {
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>Looking</h1>
        <p role="status" className="text-xl">This takes a few seconds.</p>
        <ActivityPanel events={stage.events} />
      </div>
    );
  }

  if (stage.name === "error" || stage.name === "none") {
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>{stage.name === "none" ? "I did not find it" : "I couldn't look that up"}</h1>
        <p role={stage.name === "error" ? "alert" : "status"} className="text-xl">
          {stage.name === "error" ? stage.message : "I could not find a good match. Try different words, or a clearer picture."}
        </p>
        <ActivityPanel events={stage.events} />
        <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Try again</button>
        <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
      </div>
    );
  }

  const { outcome } = stage;
  return (
    <div className="space-y-4">
      <h1 ref={headingRef} tabIndex={-1} className={h1}>{outcome.items.length === 1 ? "I found this" : "I found these"}</h1>
      {outcome.unsure && <p role="status" className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">I am not sure these are right. Look at the pictures and pick the one that matches.</p>}
      <ul className="space-y-4">
        {outcome.items.map(({ item, size }) => (
          <li key={item.id}>
            <ProductCard item={item}>
              {outcome.size && size === "yes" && <p className="rounded-xl bg-good-bg p-2 text-lg text-good-ink">It comes in size {outcome.size}.</p>}
              {outcome.size && size === "unknown" && <p className="rounded-xl bg-warn-bg p-2 text-lg text-warn-ink">I could not check the size. Look before you buy.</p>}
              <Link href={`/shop/${item.id}`} className={btnPrimary}>Look at this one</Link>
            </ProductCard>
          </li>
        ))}
      </ul>
      <ActivityPanel events={stage.events} />
      <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>Look for something else</button>
    </div>
  );
}
