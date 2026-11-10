"use client";
// "Ask North": type or upload whatever you need. The Concierge routes it to the right helper (Scam checker, Finder, Help me choose,
// the rule helper, or the Payments helper) and the activity panel shows the handoff. The pages for each helper stay as shortcuts.
// Routing can't move money: every helper here only reads or notifies, and buying is always a separate tap through the Money Guardian.
import { ProblemNote } from "@/components/states";
import { Photo } from "@/components/photo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { Channel3Credit } from "@/components/channel3-credit";
import { ProductCard } from "@/components/product-card";
import type { StepEvent } from "@/lib/agents/loop";
import type { ChooseOutcome } from "@/lib/agents/finder/choose";
import type { FinderOutcome } from "@/lib/agents/finder/finder";
import type { PaymentsOutcome } from "@/lib/agents/payments/payments";
import type { DealPayload } from "@/lib/agents/scam-checker/scam-checker";
import { formatMoney } from "@/lib/format";
import { postAgent } from "@/lib/ndjson-client";
import { resultsUrl, writeFind } from "@/lib/ui/find-cache";

type Wrapped<T> = { payload: T; flagged?: string };
export type Answer =
  | { route: "scam_checker"; payload: Wrapped<DealPayload> }
  | { route: "finder"; payload: Wrapped<FinderOutcome> }
  | { route: "help_me_choose"; payload: Wrapped<ChooseOutcome> }
  | { route: "payments"; payload: Wrapped<PaymentsOutcome> }
  | { route: "new_rule"; payload: { href: string } }
  | { route: "none" | "error"; payload: { message: string } };

const field = "n-field";
const LOOK = { fine: "n-note-good", careful: "n-note-wait", scam: "n-note-stop" } as const;

// Who really ran, for "Behind the scenes". The Concierge reads the words and hands off; the helper it picked does the work.
const HELPERS: Record<string, { name: string; ai: boolean; did: string }> = {
  scam_checker: { name: "Scam checker", ai: true, did: "Read the ad and matched it to real listings. Code wrote the verdict." },
  finder: { name: "Finder", ai: true, did: "Searched the stores. It can only find, never buy." },
  help_me_choose: { name: "Finder (help me choose)", ai: true, did: "Picked 3 ideas that fit this week's money. Code checked each one." },
  payments: { name: "Payments helper", ai: true, did: "Looked at your orders with the PayPal Agent Toolkit, read-only." },
  new_rule: { name: "Rule helper", ai: true, did: "Opens the rule screen. Nothing is saved until you say yes." },
};
const CONCIERGE = { name: "Concierge", ai: true, did: "Read what you wrote and chose the right helper. It cannot move money." };

export function AskNorth({ variant = "dialog", below, onLeave }: { variant?: "dialog" | "home"; /** Shown right under the form, above any answer (Home puts its quick buttons here). */ below?: React.ReactNode; /** Called just before this box sends the person to another page (the dialog closes itself). */ onLeave?: () => void }) {
  const home = variant === "home";
  const hintId = home ? "ask-hint-home" : "ask-hint";
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [price, setPrice] = useState("");
  const router = useRouter();

  const empty = !text.trim() && !picture;

  async function ask(extra?: { route: string; extra: Record<string, unknown> }) {
    if (busy || (!text.trim() && !picture)) return;
    setBusy(true);
    setError("");
    setEvents([]);
    if (!extra) setAnswer(null);
    const r = await postAgent<Answer["payload"]>("/api/ask", { text, imageBase64: picture?.base64, ...(extra ?? {}) }, setEvents);
    setEvents(r.events);
    setBusy(false);
    if (!r.payload || !r.line) return setError(r.error ?? "Something went wrong. Please try again.");
    const next = { route: r.line.route, payload: r.payload } as Answer;
    // Shopping has its own results page, with the words in the address. The answer is saved for that page first, so it opens
    // instantly and the stores are not asked again. (A photo can't go in an address, so a photo search stays right here.)
    const q = text.trim();
    if (!extra && q && !picture && (next.route === "finder" || next.route === "help_me_choose")) {
      writeFind(q, { answer: next, events: r.events, shown: FIRST_RESULTS });
      onLeave?.();
      router.push(resultsUrl(q));
      return;
    }
    setAnswer(next);
  }

  return (
    <section aria-labelledby="ask-h" className={`n-stack n-gap-3${home ? " ng-askbox" : ""}`}>
      {home ? (
        <h2 id="ask-h" className="ng-vh">Ask North</h2>
      ) : (
        <>
          <h2 id="ask-h" tabIndex={-1} data-autofocus className="n-dialog-title">Ask North</h2>
          <p className="n-muted">Type what you need, paste a deal, or add a photo. I will find the right helper.</p>
        </>
      )}
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="n-stack">
        <label className="n-block">
          <span className="n-label">{home ? "What do you need?" : "What do you need?"}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={home ? 3 : 2} maxLength={500} className={`${field}${home ? " ng-askbox-field" : ""}`} placeholder="Tell North what you need, paste a deal, or add a photo" />
        </label>
        <PicturePicker id={home ? "ask-picture-home" : "ask-picture"} label="Or add a photo" picture={picture} onChange={setPicture} compact={home} />
        <button type="submit" className={btnPrimary} disabled={busy || empty} aria-describedby={empty && !busy ? `${hintId}` : undefined}>{busy ? "One moment…" : "Ask North"}</button>
        {empty && !busy && <p id={hintId} className="n-hint">Type or add a photo first.</p>}
      </form>
      {below}
      {error && <ProblemNote message={error} />}
      {(busy || events.length > 0) && <ActivityPanel events={events} agents={answer ? [CONCIERGE, ...(HELPERS[answer.route] ? [HELPERS[answer.route]] : [])] : [CONCIERGE]} />}
      {answer && <AskResult a={answer} price={price} setPrice={setPrice} again={(route, extra) => ask({ route, extra })} />}
    </section>
  );
}

/** How many finds show before "Show more". */
export const FIRST_RESULTS = 6;

export function AskResult({ a, price, setPrice, again, shown = FIRST_RESULTS, onMore }: {
  a: Answer; price: string; setPrice: (s: string) => void; again: (route: string, extra: Record<string, unknown>) => void;
  /** How many finds to show now, and what "Show more" does. Without `onMore` there is no button. */
  shown?: number; onMore?: () => void;
}) {
  if (a.route === "none" || a.route === "error") return <p role="status" className="n-note n-note-quiet"><span>{a.payload.message}</span></p>;
  if (a.route === "new_rule") return <Link href={a.payload.href} className={btnPrimary}>Open the rule helper</Link>;

  if (a.route === "scam_checker") {
    const p = a.payload.payload;
    if (p.kind === "error") return <ProblemNote message={p.message} />;
    if (p.kind === "needs_price") {
      return (
        <div className="n-stack n-gap-2">
          <p className="n-t-xl n-strong">{p.question}</p>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={field} aria-label="Price in dollars" />
          <button type="button" className={btnPrimary} disabled={!(Number(price) > 0)} onClick={() => again("scam_checker", { priceDollars: Number(price) })}>Check again</button>
        </div>
      );
    }
    const [main, ...rest] = p.verdict.reasons;
    return (
      <div className="n-stack n-gap-2" role="status">
        <div className={`n-note ${LOOK[p.verdict.kind]}`}><div>
          <p className="n-t-2xl n-strong">{p.verdict.headline}</p>
          <p className="n-mt-1 n-t-lg">{main}</p>
        </div></div>
        {rest.length > 0 && <ul className="n-t-lg n-list">{rest.map((r) => <li key={r}>{r}</li>)}</ul>}
        {a.payload.flagged === "yes" && p.sellerDomain && <p className="n-note n-note-stop"><span><strong>I will not let you pay {p.sellerDomain}.</strong></span></p>}
        <Link href="/check" className={btnSecondary}>Open the full check</Link>
      </div>
    );
  }

  if (a.route === "finder") {
    const p = a.payload.payload;
    if (p.kind === "error") return <ProblemNote message={p.message} />;
    if (p.kind === "none") return <p role="status" className="n-t-lg">I did not find it. Try different words, or a clearer picture.</p>;
    const visible = p.items.slice(0, shown);
    const more = p.items.length - visible.length;
    return (
      <div className="n-stack">
        <p className="n-muted" role="status">{p.items.length === 1 ? "1 thing" : `${p.items.length} things`} found. Showing {visible.length}.</p>
        <ul className="fr-grid">
          {visible.map(({ item }, i) => (
            <li key={item.id}>
              <ProductCard item={item} openCompare={i === 0 && visible.length === 1}><Link href={`/shop/${item.id}`} className={btnSecondary}>Look at this one</Link></ProductCard>
            </li>
          ))}
        </ul>
        {more > 0 && onMore && <button type="button" className={btnSecondary} onClick={onMore}>Show {more} more</button>}
        <Channel3Credit />
      </div>
    );
  }

  if (a.route === "help_me_choose") {
    const p = a.payload.payload;
    if (p.kind === "error") return <ProblemNote message={p.message} />;
    if (p.kind === "question") {
      return (
        <div className="n-stack n-gap-2">
          <p className="n-t-xl n-strong">{p.question}</p>
          <ul className="n-grid-2">
            {p.choices.map((c) => (
              <li key={c.label}>
                <button type="button" onClick={() => again("help_me_choose", { answer: c.label })} className={`${card} n-tile`}>
                  <Photo src={c.imageUrl} className="n-photo n-photo-sm" />
                  <span className="n-t-lg n-strong">{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (p.kind === "nothing_fits") return <p role="status" className="n-t-lg">Nothing I found fits the {formatMoney(p.leftCents)} you have left this week.{p.cheapestCents ? ` The lowest price I saw was ${formatMoney(p.cheapestCents)}.` : ""} That is okay. Try something that costs less.</p>;
    if (p.kind === "no_results") return <p role="status" className="n-t-lg">I did not find a good idea for that. Try other words.</p>;
    return (
      <div className="n-stack n-gap-2">
        <p className="n-note n-note-good"><span>You have {formatMoney(p.leftCents)} left this week. These all fit.</span></p>
        <ul className="n-stack">
          {p.picks.map((pk, i) => (
            <li key={pk.item.id}>
              <ProductCard item={pk.item} openCompare={i === 0}>
                <p className="n-t-lg">{pk.reason}</p>
                <Link href={`/shop/${pk.item.id}`} className={btnSecondary}>Look at this one</Link>
              </ProductCard>
            </li>
          ))}
        </ul>
        <Channel3Credit />
      </div>
    );
  }

  // payments
  if (a.route !== "payments") return null;
  const p = a.payload.payload;
  if (p.kind === "error" || p.kind === "none") return <p role="status" className="n-t-lg">{p.message}</p>;
  return (
    <div className="n-stack n-gap-2" role="status">
      <p className="n-t-xl n-strong">{p.summary}</p>
      <ul className="n-stack n-gap-2">
        {p.rows.map((r, i) => (
          <li key={i} className="n-sub n-t-lg">
            <strong>{r.name}</strong>, {formatMoney(r.amountCents)}. North says {r.ours}.{" "}
            {r.paypal.checked ? `PayPal says ${r.paypal.words}. ${r.paypal.note}` : r.paypal.why}
          </li>
        ))}
      </ul>
      <Link href="/money" className={btnSecondary}>Open Money</Link>
    </div>
  );
}
