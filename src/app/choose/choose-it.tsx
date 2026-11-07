"use client";
// "Help me choose": say what you need in your own words (even vaguely) or show a photo.
// If it is too vague, ONE question with picture choices. Then 3 ideas that fit this week's money.
// Picking only opens the product; to buy, the Money Guardian still decides.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { ProductCard } from "@/components/product-card";
import type { StepEvent } from "@/lib/agents/loop";
import type { ChooseOutcome } from "@/lib/agents/finder/choose";
import { formatMoney } from "@/lib/format";
import { postAgent } from "@/lib/ndjson-client";

type Stage =
  | { name: "ask" }
  | { name: "thinking"; events: StepEvent[] }
  | { name: "question"; outcome: Extract<ChooseOutcome, { kind: "question" }>; events: StepEvent[] }
  | { name: "picks"; outcome: Extract<ChooseOutcome, { kind: "picks" }>; events: StepEvent[] }
  | { name: "nothing"; outcome: Extract<ChooseOutcome, { kind: "nothing_fits" | "no_results" }>; events: StepEvent[] }
  | { name: "error"; message: string; events: StepEvent[] };

const h1 = "text-3xl font-bold outline-none";
const field = "min-h-14 w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg";

export function ChooseIt() {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  async function choose(answer?: string) {
    setStage({ name: "thinking", events: [] });
    const r = await postAgent<ChooseOutcome>("/api/choose", { text, imageBase64: picture?.base64, answer }, (events) => setStage({ name: "thinking", events }));
    const p = r.payload;
    if (!p) setStage({ name: "error", message: r.error ?? "Something went wrong. Please try again.", events: r.events });
    else if (p.kind === "error") setStage({ name: "error", message: p.message, events: r.events });
    else if (p.kind === "question") setStage({ name: "question", outcome: p, events: r.events });
    else if (p.kind === "picks") setStage({ name: "picks", outcome: p, events: r.events });
    else setStage({ name: "nothing", outcome: p, events: r.events });
  }

  if (stage.name === "ask") {
    return (
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (text.trim() || picture) choose(); }}>
        <h1 ref={headingRef} tabIndex={-1} className={h1}>Help me choose</h1>
        <p className="text-xl">Tell me what you need. I will give you 3 ideas that fit the money you have left this week.</p>
        <label className="block space-y-2">
          <span className="block text-xl font-semibold">What do you need?</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} className={field} placeholder="something to keep my feet warm, not too expensive" />
        </label>
        <PicturePicker id="choose-picture" label="Or show me a picture" picture={picture} onChange={setPicture} />
        <button type="submit" className={btnPrimary} disabled={!text.trim() && !picture}>Help me choose</button>
        <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
      </form>
    );
  }

  if (stage.name === "thinking") {
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>Thinking</h1>
        <p role="status" className="text-xl">This takes a few seconds.</p>
        <ActivityPanel events={stage.events} />
      </div>
    );
  }

  if (stage.name === "question") {
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>{stage.outcome.question}</h1>
        <p className="text-xl">Tap the picture that is closest.</p>
        <ul className="grid grid-cols-2 gap-3">
          {stage.outcome.choices.map((c) => (
            <li key={c.label}>
              <button type="button" onClick={() => choose(c.label)} className={`${card} flex h-full w-full flex-col items-center gap-2 text-center hover:border-accent`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.imageUrl} alt="" className="h-32 w-full rounded-xl bg-white object-contain" />
                <span className="text-xl font-semibold">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <ActivityPanel events={stage.events} />
        <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>Start over</button>
      </div>
    );
  }

  if (stage.name === "picks") {
    const { picks, leftCents } = stage.outcome;
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>{picks.length === 3 ? "3 ideas for you" : picks.length === 1 ? "1 idea for you" : `${picks.length} ideas for you`}</h1>
        <p className="rounded-xl bg-good-bg p-3 text-xl text-good-ink">You have {formatMoney(leftCents)} left this week. These all fit.</p>
        {picks.length < 3 && <p className="text-lg">Only {picks.length === 1 ? "one" : "two"} fit your money this week.</p>}
        <ul className="space-y-4">
          {picks.map((p) => (
            <li key={p.item.id}>
              <ProductCard item={p.item}>
                <p className="text-lg">{p.reason}</p>
                <Link href={`/shop/${p.item.id}`} className={btnPrimary}>Look at this one</Link>
              </ProductCard>
            </li>
          ))}
        </ul>
        <ActivityPanel events={stage.events} />
        <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>Start over</button>
      </div>
    );
  }

  if (stage.name === "nothing") {
    const o = stage.outcome;
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>{o.kind === "nothing_fits" ? "Nothing fits this week" : "I did not find anything"}</h1>
        <p role="status" className="text-xl">
          {o.kind === "nothing_fits"
            ? `I found some ideas, but none fit the ${formatMoney(o.leftCents)} you have left this week.${o.cheapestCents ? ` The lowest price I saw was ${formatMoney(o.cheapestCents)}.` : ""} That is okay. You can try again next week, or ask for something that costs less.`
            : "I could not find a good idea for that. Try other words, or a clearer picture."}
        </p>
        <ActivityPanel events={stage.events} />
        <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Try something else</button>
        <Link href="/" className={btnSecondary}>See my money</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 ref={headingRef} tabIndex={-1} className={h1}>I couldn&apos;t do that</h1>
      <p role="alert" className="text-xl">{stage.message}</p>
      <ActivityPanel events={stage.events} />
      <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Try again</button>
    </div>
  );
}
