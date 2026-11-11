"use client";
// Find: one place for words or a photo. The Concierge reads what you wrote and decides between a search, "help me choose" (3 picks that fit this
// week's money) and the other helpers. A photo with no words is read as "buy this again": the top matches, each with a one-tap Buy that goes
// through the same review and the same Money Guardian. Finding never buys anything.
import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { BuyFlow, type BuyItem } from "@/components/buy-flow";
import { btnSecondary } from "@/components/classes";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { Channel3Credit } from "@/components/channel3-credit";
import { ProductCard } from "@/components/product-card";
import { ErrorNote, Loading } from "@/components/states";
import type { StepEvent } from "@/lib/agents/loop";
import type { FinderOutcome } from "@/lib/agents/finder/finder";
import { postAgent } from "@/lib/ndjson-client";
import { normalizeQuery, readFind, readLastResults, rememberResults, resultsUrl, writeFind } from "@/lib/ui/find-cache";
import { AskResult, FIRST_RESULTS, type Answer } from "../ask-north";

const CONCIERGE = { name: "Concierge", ai: true, did: "Read what you wrote and chose the right helper. It cannot move money." };
const FINDER = { name: "Finder", ai: true, did: "Searched the stores. It can only find, never buy." };

type Stage =
  | { name: "ask" }
  | { name: "thinking"; events: StepEvent[] }
  | { name: "answer"; answer: Answer; events: StepEvent[] }
  | { name: "again"; items: Extract<FinderOutcome, { kind: "found" }>["items"]; events: StepEvent[] }
  | { name: "error"; message: string; events: StepEvent[] };

/**
 * Put the page back where it was. The results are drawn a moment after the page opens (and the browser may scroll to the top once the page
 * changes), so this tries for about a second, and stops at once if the person scrolls themselves.
 */
function restoreScroll(y: number) {
  let frames = 0;
  let stop = false;
  const cancel = () => { stop = true; };
  const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  events.forEach((e) => window.addEventListener(e, cancel, { passive: true, once: true }));
  const tick = () => {
    const tallEnough = document.documentElement.scrollHeight >= y + window.innerHeight * 0.8;
    if (!stop && tallEnough && Math.abs(window.scrollY - y) > 2) window.scrollTo({ top: y, behavior: "instant" });
    if (!stop && ++frames < 60) requestAnimationFrame(tick);
    else events.forEach((e) => window.removeEventListener(e, cancel));
  };
  requestAnimationFrame(tick);
}

/** The "Or look around" shelf is for when nothing has been searched yet. */
export function BrowseOnly({ children }: { children: ReactNode }) {
  return useSearchParams().get("q") ? null : <>{children}</>;
}

export function FindIt() {
  // The search words live in the address (/find?q=running+shoes), so Back, a refresh and a shared link all show the same results.
  const q = (useSearchParams().get("q") ?? "").slice(0, 500);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState(q);
  const [price, setPrice] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [buying, setBuying] = useState<BuyItem | null>(null);
  const [shown, setShown] = useState(FIRST_RESULTS);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const ranFor = useRef<string | null>(null);
  const fromCache = useRef(false);
  const done = stage.name === "answer" || stage.name === "again";
  useEffect(() => {
    // A new search moves focus to the results. Results brought back from memory keep the page where it was.
    if (done && !fromCache.current) resultsRef.current?.focus();
  }, [done]);

  const find = useCallback(async (words: string, extra?: { route: string; extra: Record<string, unknown> }, withPicture: Picture | null = null) => {
    if (!words.trim() && !withPicture) return;
    setStage({ name: "thinking", events: [] });
    fromCache.current = false;
    // A photo and no words: "buy this again". Otherwise the Concierge decides.
    if (!extra && withPicture && !words.trim()) {
      const r = await postAgent<FinderOutcome>("/api/find", { mode: "reorder", imageBase64: withPicture.base64 }, (events) => setStage({ name: "thinking", events }));
      const p = r.payload;
      if (!p) setStage({ name: "error", message: r.error ?? "That did not work. Nothing was bought. Try again.", events: r.events });
      else if (p.kind === "error") setStage({ name: "error", message: p.message, events: r.events });
      else if (p.kind === "none") setStage({ name: "answer", answer: { route: "none", payload: { message: "I did not find it. Try a clearer picture, with the label showing." } }, events: r.events });
      else setStage({ name: "again", items: p.items, events: r.events });
      return;
    }
    const r = await postAgent<Answer["payload"]>("/api/ask", { text: words, imageBase64: withPicture?.base64, ...(extra ?? {}) }, (events) => setStage({ name: "thinking", events }));
    if (!r.payload || !r.line) return setStage({ name: "error", message: r.error ?? "That did not work. Nothing was bought. Try again.", events: r.events });
    const answer = { route: r.line.route, payload: r.payload } as Answer;
    setStage({ name: "answer", answer, events: r.events });
    // Remember a words-only search, so coming back never asks the stores (and spends a credit) again.
    if (!withPicture && words.trim()) writeFind(words, { answer, events: r.events, shown: FIRST_RESULTS });
  }, []);

  // Open /find?q=…: from memory if this tab already searched it, otherwise search once.
  useEffect(() => {
    if (!q) {
      ranFor.current = null;
      return;
    }
    const key = normalizeQuery(q);
    // Coming back to this page from a product: the page is kept alive but shown again, so it only has to find its place.
    const last = readLastResults();
    const backHere = !!last && last.url === resultsUrl(q);
    if (ranFor.current === key) {
      if (backHere) restoreScroll(last.scroll);
      return;
    }
    ranFor.current = key;
    const hit = readFind(q);
    if (hit) {
      // Reading this tab's saved results is syncing with an outside store (sessionStorage), which the server can't see: it has to happen after the first render.
      /* eslint-disable react-hooks/set-state-in-effect */
      fromCache.current = true;
      setText(q);
      setShown(hit.shown);
      setStage({ name: "answer", answer: hit.answer as Answer, events: hit.events as StepEvent[] });
      /* eslint-enable react-hooks/set-state-in-effect */
      if (backHere) restoreScroll(last.scroll);
      return;
    }
    setText(q);
    setShown(FIRST_RESULTS);
    void find(q);
  }, [q, find]);

  function submit() {
    const words = text.trim();
    if (!words && !picture) return;
    if (picture || !words) return void find(words, undefined, picture); // a photo can't go in an address, so it searches right here
    if (normalizeQuery(words) === normalizeQuery(q) && stage.name !== "error") return; // the same words: keep what is already here
    ranFor.current = null;
    router.push(resultsUrl(words));
  }

  function showMore() {
    setShown(1000);
    if (stage.name === "answer" && q) writeFind(q, { answer: stage.answer, events: stage.events, shown: 1000 });
  }

  // Opening a product: remember where in the results we were, so "Back to results" lands in the same place.
  function leaving(e: React.MouseEvent) {
    const link = (e.target as HTMLElement).closest("a");
    if (q && link?.getAttribute("href")?.startsWith("/shop/")) rememberResults({ url: resultsUrl(q), scroll: window.scrollY });
  }

  const events = stage.name === "ask" ? [] : stage.events;
  const agents = stage.name === "again" ? [FINDER] : stage.name === "answer" ? [CONCIERGE] : [CONCIERGE];

  return (
    <div className="n-col" style={{ maxWidth: 980 }}>
      <h1 className="ng-vh">Find something</h1>

      {/* ONE slim search bar: words in the middle, a Photo button and the round Find it button on the right. Enter searches. */}
      <form className="fs-form" role="search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p id="find-hint" className="ng-vh">A photo with no words finds the same thing so you can buy it again.</p>
        <div className="fs-bar">
          <label htmlFor="find-q" className="ng-vh">What do you need?</label>
          <input
            id="find-q" type="text" enterKeyHint="search" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
            className="fs-input" aria-describedby="find-hint" placeholder="What do you need? Try 'running shoes' or 'a phone under $100'"
          />
          <PicturePicker variant="bar" id="find-picture" label="Add a photo" picture={picture} onChange={setPicture} />
          <button type="submit" className="fs-go" aria-label="Find it" title="Find it" disabled={stage.name === "thinking" || (!text.trim() && !picture)}><ArrowRight aria-hidden="true" /></button>
        </div>
      </form>

      {stage.name === "thinking" && <Loading what="your results" />}
      {stage.name === "error" && <ErrorNote what="that" touched="Nothing was bought." onRetry={() => void find(text, undefined, picture)} />}

      {done && (
        <section aria-labelledby="results-h" className="n-stack" onClickCapture={leaving}>
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
            <AskResult a={stage.answer} price={price} setPrice={setPrice} again={(route, extra) => void find(text, { route, extra })} shown={shown} onMore={showMore} />
          )}
          {stage.name === "again" && <Channel3Credit />}
        </section>
      )}
      {events.length > 0 && stage.name !== "thinking" && <ActivityPanel events={events} agents={agents} title="What I did" />}
      {buying && <BuyFlow item={buying} onClose={() => setBuying(null)} />}
    </div>
  );
}
