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
type Answer =
  | { route: "scam_checker"; payload: Wrapped<DealPayload> }
  | { route: "finder"; payload: Wrapped<FinderOutcome> }
  | { route: "help_me_choose"; payload: Wrapped<ChooseOutcome> }
  | { route: "payments"; payload: Wrapped<PaymentsOutcome> }
  | { route: "new_rule"; payload: { href: string } }
  | { route: "none" | "error"; payload: { message: string } };

const field = "min-h-14 w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg";
const LOOK = { fine: "bg-good-bg text-good-ink", careful: "bg-warn-bg text-warn-ink", scam: "bg-bad-bg text-bad-ink" } as const;

export function AskNorth() {
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
    <section aria-labelledby="ask-h" className={`${card} space-y-3`}>
      <h2 id="ask-h" className="text-2xl font-bold">Ask North</h2>
      <p className="text-lg">Type what you need, or add a picture. I will find the right helper.</p>
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="space-y-3">
        <label className="block space-y-2">
          <span className="block text-lg font-semibold">What do you need?</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} className={field} placeholder="Is this deal real? Find me warm socks. Did my order go through?" />
        </label>
        <PicturePicker id="ask-picture" label="Or add a picture" picture={picture} onChange={setPicture} />
        <button type="submit" className={btnPrimary} disabled={busy || (!text.trim() && !picture)}>{busy ? "One moment…" : "Ask North"}</button>
      </form>
      {error && <p role="alert" className="text-lg text-bad-ink">{error}</p>}
      {(busy || events.length > 0) && <ActivityPanel events={events} />}
      {answer && <AskResult a={answer} price={price} setPrice={setPrice} again={(route, extra) => ask({ route, extra })} />}
    </section>
  );
}

function AskResult({ a, price, setPrice, again }: { a: Answer; price: string; setPrice: (s: string) => void; again: (route: string, extra: Record<string, unknown>) => void }) {
  if (a.route === "none" || a.route === "error") return <p role="status" className="text-lg">{a.payload.message}</p>;
  if (a.route === "new_rule") return <Link href={a.payload.href} className={btnPrimary}>Open the rule helper</Link>;

  if (a.route === "scam_checker") {
    const p = a.payload.payload;
    if (p.kind === "error") return <p role="alert" className="text-lg">{p.message}</p>;
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
        <div className={`rounded-2xl p-4 ${LOOK[p.verdict.kind]}`}>
          <p className="text-2xl font-bold">{p.verdict.headline}</p>
          <p className="mt-1 text-lg">{main}</p>
        </div>
        {rest.length > 0 && <ul className="list-disc space-y-1 pl-6 text-lg">{rest.map((r) => <li key={r}>{r}</li>)}</ul>}
        {a.payload.flagged === "yes" && p.sellerDomain && <p className="rounded-xl border-2 border-bad-ink bg-bad-bg p-3 text-lg font-semibold text-bad-ink">I will not let you pay {p.sellerDomain}.</p>}
        <Link href="/check" className={btnSecondary}>Open the full check</Link>
      </div>
    );
  }

  if (a.route === "finder") {
    const p = a.payload.payload;
    if (p.kind === "error") return <p role="alert" className="text-lg">{p.message}</p>;
    if (p.kind === "none") return <p role="status" className="text-lg">I did not find it. Try different words, or a clearer picture.</p>;
    return (
      <ul className="space-y-3">
        {p.items.map(({ item }) => (
          <li key={item.id}>
            <ProductCard item={item}><Link href={`/shop/${item.id}`} className={btnPrimary}>Look at this one</Link></ProductCard>
          </li>
        ))}
      </ul>
    );
  }

  if (a.route === "help_me_choose") {
    const p = a.payload.payload;
    if (p.kind === "error") return <p role="alert" className="text-lg">{p.message}</p>;
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
        <p className="rounded-xl bg-good-bg p-3 text-lg text-good-ink">You have {formatMoney(p.leftCents)} left this week. These all fit.</p>
        <ul className="space-y-3">
          {p.picks.map((pk) => (
            <li key={pk.item.id}>
              <ProductCard item={pk.item}>
                <p className="text-lg">{pk.reason}</p>
                <Link href={`/shop/${pk.item.id}`} className={btnPrimary}>Look at this one</Link>
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
      <Link href="/payments" className={btnSecondary}>Open My payments</Link>
    </div>
  );
}
