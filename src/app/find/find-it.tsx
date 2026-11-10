"use client";
// Find: one place for words or a photo. The Concierge reads what you wrote and decides between a search, "help me choose" (3 picks that fit this
// week's money) and the other helpers. A photo with no words is read as "buy this again": the top matches, each with a one-tap Buy that goes
// through the same review and the same Money Guardian. Finding never buys anything.
import { Search, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { BuyFlow, type BuyItem } from "@/components/buy-flow";
import { btnPrimary, btnSecondary } from "@/components/classes";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { ProductCard } from "@/components/product-card";
import { ErrorNote, Loading } from "@/components/states";
import type { StepEvent } from "@/lib/agents/loop";
import type { FinderOutcome } from "@/lib/agents/finder/finder";
import { postAgent } from "@/lib/ndjson-client";
import { AskResult, type Answer } from "../ask-north";

const CONCIERGE = { name: "Concierge", ai: true, did: "Read what you wrote and chose the right helper. It cannot move money." };
const FINDER = { name: "Finder", ai: true, did: "Searched the stores. It can only find, never buy." };

type Stage =
  | { name: "ask" }
  | { name: "thinking"; events: StepEvent[] }
  | { name: "answer"; answer: Answer; events: StepEvent[] }
  | { name: "again"; items: Extract<FinderOutcome, { kind: "found" }>["items"]; events: StepEvent[] }
  | { name: "error"; message: string; events: StepEvent[] };

export function FindIt() {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState("");
  const [price, setPrice] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [buying, setBuying] = useState<BuyItem | null>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const done = stage.name === "answer" || stage.name === "again";
  useEffect(() => {
    if (done) resultsRef.current?.focus();
  }, [done]);

  async function find(extra?: { route: string; extra: Record<string, unknown> }) {
    if (!text.trim() && !picture) return;
    setStage({ name: "thinking", events: [] });
    // A photo and no words: "buy this again". Otherwise the Concierge decides.
    if (!extra && picture && !text.trim()) {
      const r = await postAgent<FinderOutcome>("/api/find", { mode: "reorder", imageBase64: picture.base64 }, (events) => setStage({ name: "thinking", events }));
      const p = r.payload;
      if (!p) setStage({ name: "error", message: r.error ?? "That did not work. Nothing was bought. Try again.", events: r.events });
      else if (p.kind === "error") setStage({ name: "error", message: p.message, events: r.events });
      else if (p.kind === "none") setStage({ name: "answer", answer: { route: "none", payload: { message: "I did not find it. Try a clearer picture, with the label showing." } }, events: r.events });
      else setStage({ name: "again", items: p.items, events: r.events });
      return;
    }
    const r = await postAgent<Answer["payload"]>("/api/ask", { text, imageBase64: picture?.base64, ...(extra ?? {}) }, (events) => setStage({ name: "thinking", events }));
    if (!r.payload || !r.line) return setStage({ name: "error", message: r.error ?? "That did not work. Nothing was bought. Try again.", events: r.events });
    setStage({ name: "answer", answer: { route: r.line.route, payload: r.payload } as Answer, events: r.events });
  }

  const events = stage.name === "ask" ? [] : stage.events;
  const agents = stage.name === "again" ? [FINDER] : stage.name === "answer" ? [CONCIERGE] : [CONCIERGE];

  return (
    <div className="n-col" style={{ maxWidth: 760 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Find</div>
        <h1>What are you<br />looking for?</h1>
        <p>Type what you want, or add a photo. North finds it, and shows every store&apos;s price.</p>
      </div>

      <form className="n-stack" style={{ gap: 18 }} onSubmit={(e) => { e.preventDefault(); void find(); }}>
        <p className="ng-vh">A photo with no words finds the same thing so you can buy it again.</p>
        <label className="n-block">
          <span className="n-label">What do you need?</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} className="n-field" placeholder="Running shoes, size 8. Or: something warm for my feet, not too expensive." />
        </label>
        <PicturePicker id="find-picture" label="Or add a photo of it" picture={picture} onChange={setPicture} />
        <button type="submit" className={btnPrimary} disabled={stage.name === "thinking" || (!text.trim() && !picture)}><Search aria-hidden="true" />{stage.name === "thinking" ? "Looking…" : "Find it"}</button>
      </form>

      {stage.name === "thinking" && <Loading what="your results" />}
      {stage.name === "error" && <ErrorNote what="that" touched="Nothing was bought." onRetry={() => void find()} />}

      {done && (
        <section aria-labelledby="results-h" className="n-stack">
          <h2 id="results-h" ref={resultsRef} tabIndex={-1} style={{ outline: "none" }}>{stage.name === "again" ? "Which one is it?" : "What I found"}</h2>
          {stage.name === "again" ? (
            <ul className="n-stack" style={{ gap: 18 }}>
              {stage.items.map(({ item }, i) => (
                <li key={item.id}>
                  <ProductCard item={item} openCompare={i === 0}>
                    <button type="button" className={btnSecondary} onClick={() => setBuying({ id: item.id, name: item.name, imageUrl: item.imageUrl, priceCents: item.priceCents, seller: item.domain, category: item.category })}><Wallet aria-hidden="true" />Buy this one</button>
                    <Link href={`/shop/${item.id}`} className="n-btn n-btn-quiet">Look at this one</Link>
                  </ProductCard>
                </li>
              ))}
            </ul>
          ) : (
            <AskResult a={stage.answer} price={price} setPrice={setPrice} again={(route, extra) => void find({ route, extra })} />
          )}
        </section>
      )}
      {events.length > 0 && stage.name !== "thinking" && <ActivityPanel events={events} agents={agents} title="What I did" />}
      {buying && <BuyFlow item={buying} onClose={() => setBuying(null)} />}
    </div>
  );
}
