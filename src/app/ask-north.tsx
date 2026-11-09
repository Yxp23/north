"use client";
// "Ask North": type or upload whatever you need. The Concierge routes it to the right helper (Scam checker, Finder, Help me choose,
// the rule helper, or the Payments helper) and the activity panel shows the handoff. The pages for each helper stay as shortcuts.
// Routing can't move money: every helper here only reads or notifies, and buying is always a separate tap through the Money Guardian.
import Link from "next/link";
import { useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { PicturePicker, type Picture } from "@/components/picture-picker";
import { ProductCard } from "@/components/product-card";
import type { StepEvent } from "@/lib/agents/loop";
import type { ChooseOutcome } from "@/lib/agents/finder/choose";
import type { FinderOutcome } from "@/lib/agents/finder/finder";
import type { PaymentsOutcome } from "@/lib/agents/payments/payments";
import type { DealPayload } from "@/lib/agents/scam-checker/scam-checker";
import { formatMoney } from "@/lib/format";
import { postAgent } from "@/lib/ndjson-client";

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

export function AskNorth({ variant = "dialog" }: { variant?: "dialog" | "home" }) {
  const home = variant === "home";
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [price, setPrice] = useState("");

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
    setAnswer({ route: r.line.route, payload: r.payload } as Answer);
  }

  return (
    <section aria-labelledby="ask-h" className={`n-stack${home ? " ng-askbox" : ""}`} style={{ gap: 16 }}>
      {home ? (
        <h2 id="ask-h" className="ng-vh">Ask North</h2>
      ) : (
        <>
          <h2 id="ask-h" tabIndex={-1} data-autofocus style={{ outline: "none", fontSize: 30, letterSpacing: -0.8 }}>Ask North</h2>
          <p style={{ color: "var(--n-muted)" }}>Type what you need, paste a deal, or add a photo. I will find the right helper.</p>
        </>
      )}
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="n-stack">
        <label className="block">
          <span className="n-label">{home ? "Ask North" : "What do you need?"}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={home ? 3 : 2} maxLength={500} className={`${field}${home ? " ng-askbox-field" : ""}`} placeholder="Tell North what you need, paste a deal, or add a photo" />
        </label>
        <PicturePicker id={home ? "ask-picture-home" : "ask-picture"} label="Add a photo (optional)" picture={picture} onChange={setPicture} />
        <button type="submit" className={btnPrimary} disabled={busy || (!text.trim() && !picture)}>{busy ? "One moment…" : "Ask North"}</button>
      </form>
      {error && <p role="alert" className="n-note n-note-stop"><span>{error}</span></p>}
      {(busy || events.length > 0) && <ActivityPanel events={events} agents={answer ? [CONCIERGE, ...(HELPERS[answer.route] ? [HELPERS[answer.route]] : [])] : [CONCIERGE]} />}
      {answer && <AskResult a={answer} price={price} setPrice={setPrice} again={(route, extra) => ask({ route, extra })} />}
    </section>
  );
}

export function AskResult({ a, price, setPrice, again }: { a: Answer; price: string; setPrice: (s: string) => void; again: (route: string, extra: Record<string, unknown>) => void }) {
  if (a.route === "none" || a.route === "error") return <p role="status" className="n-note n-note-quiet"><span>{a.payload.message}</span></p>;
  if (a.route === "new_rule") return <Link href={a.payload.href} className={btnPrimary}>Open the rule helper</Link>;

  if (a.route === "scam_checker") {
    const p = a.payload.payload;
    if (p.kind === "error") return <p role="alert" className="n-note n-note-stop"><span>{p.message}</span></p>;
    if (p.kind === "needs_price") {
      return (
        <div className="space-y-2">
          <p className="text-xl font-semibold">{p.question}</p>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={field} aria-label="Price in dollars" />
          <button type="button" className={btnPrimary} disabled={!(Number(price) > 0)} onClick={() => again("scam_checker", { priceDollars: Number(price) })}>Check again</button>
        </div>
      );
    }
    const [main, ...rest] = p.verdict.reasons;
    return (
      <div className="space-y-2" role="status">
        <div className={`n-note ${LOOK[p.verdict.kind]}`}><div>
          <p className="text-2xl font-bold">{p.verdict.headline}</p>
          <p className="mt-1 text-lg">{main}</p>
        </div></div>
        {rest.length > 0 && <ul className="list-disc space-y-1 pl-6 text-lg">{rest.map((r) => <li key={r}>{r}</li>)}</ul>}
        {a.payload.flagged === "yes" && p.sellerDomain && <p className="n-note n-note-stop"><span><strong>I will not let you pay {p.sellerDomain}.</strong></span></p>}
        <Link href="/check" className={btnSecondary}>Open the full check</Link>
      </div>
    );
  }

  if (a.route === "finder") {
    const p = a.payload.payload;
    if (p.kind === "error") return <p role="alert" className="n-note n-note-stop"><span>{p.message}</span></p>;
    if (p.kind === "none") return <p role="status" className="text-lg">I did not find it. Try different words, or a clearer picture.</p>;
    return (
      <ul className="space-y-3">
        {p.items.map(({ item }, i) => (
          <li key={item.id}>
            <ProductCard item={item} openCompare={i === 0}><Link href={`/shop/${item.id}`} className={btnSecondary}>Look at this one</Link></ProductCard>
          </li>
        ))}
      </ul>
    );
  }

  if (a.route === "help_me_choose") {
    const p = a.payload.payload;
    if (p.kind === "error") return <p role="alert" className="n-note n-note-stop"><span>{p.message}</span></p>;
    if (p.kind === "question") {
      return (
        <div className="space-y-2">
          <p className="text-xl font-semibold">{p.question}</p>
          <ul className="grid grid-cols-2 gap-3">
            {p.choices.map((c) => (
              <li key={c.label}>
                <button type="button" onClick={() => again("help_me_choose", { answer: c.label })} className={`${card} flex h-full w-full flex-col items-center gap-2 text-center hover:border-accent`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl} alt="" className="h-24 w-full rounded-xl bg-white object-contain" />
                  <span className="text-lg font-semibold">{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (p.kind === "nothing_fits") return <p role="status" className="text-lg">Nothing I found fits the {formatMoney(p.leftCents)} you have left this week.{p.cheapestCents ? ` The lowest price I saw was ${formatMoney(p.cheapestCents)}.` : ""} That is okay. Try something that costs less.</p>;
    if (p.kind === "no_results") return <p role="status" className="text-lg">I did not find a good idea for that. Try other words.</p>;
    return (
      <div className="space-y-2">
        <p className="n-note n-note-good"><span>You have {formatMoney(p.leftCents)} left this week. These all fit.</span></p>
        <ul className="space-y-3">
          {p.picks.map((pk, i) => (
            <li key={pk.item.id}>
              <ProductCard item={pk.item} openCompare={i === 0}>
                <p className="text-lg">{pk.reason}</p>
                <Link href={`/shop/${pk.item.id}`} className={btnSecondary}>Look at this one</Link>
              </ProductCard>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // payments
  if (a.route !== "payments") return null;
  const p = a.payload.payload;
  if (p.kind === "error" || p.kind === "none") return <p role="status" className="text-lg">{p.message}</p>;
  return (
    <div className="space-y-2" role="status">
      <p className="text-xl font-semibold">{p.summary}</p>
      <ul className="space-y-2">
        {p.rows.map((r, i) => (
          <li key={i} className="rounded-xl border border-line p-3 text-lg">
            <strong>{r.name}</strong>, {formatMoney(r.amountCents)}. North says {r.ours}.{" "}
            {r.paypal.checked ? `PayPal says ${r.paypal.words}. ${r.paypal.note}` : r.paypal.why}
          </li>
        ))}
      </ul>
      <Link href="/money" className={btnSecondary}>Open Money</Link>
    </div>
  );
}
