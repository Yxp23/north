"use client";
// "My payments": ask about your orders. The helper asks PayPal (through the PayPal Agent Toolkit) and tells you in plain words.
// It can only look. Every amount comes from North's record or PayPal, never from the AI's words.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import type { StepEvent } from "@/lib/agents/loop";
import type { PaymentsOutcome } from "@/lib/agents/payments/payments";
import { formatMoney } from "@/lib/format";
import { postAgent } from "@/lib/ndjson-client";

type Answer = Extract<PaymentsOutcome, { kind: "answer" }>;
type Stage =
  | { name: "ask" }
  | { name: "thinking"; events: StepEvent[] }
  | { name: "answer"; answer: Answer; events: StepEvent[] }
  | { name: "message"; title: string; message: string; events: StepEvent[] };

const h1 = "text-3xl font-bold outline-none";
const field = "n-field";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function PaymentsHelp() {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  async function ask(question: string) {
    setStage({ name: "thinking", events: [] });
    const r = await postAgent<PaymentsOutcome>("/api/concierge/payments", { question }, (events) => setStage({ name: "thinking", events }));
    const p = r.payload;
    if (!p) setStage({ name: "message", title: "I couldn't look that up", message: r.error ?? "Something went wrong. Please try again.", events: r.events });
    else if (p.kind === "answer") setStage({ name: "answer", answer: p, events: r.events });
    else if (p.kind === "none") setStage({ name: "message", title: "Nothing yet", message: p.message, events: r.events });
    else setStage({ name: "message", title: "I couldn't look that up", message: p.message, events: r.events });
  }

  if (stage.name === "ask") {
    return (
      <div className="n-col">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>My payments</h1>
        <p className="text-xl">I can look at your orders with PayPal. I can only look. I can&apos;t pay or change anything.</p>
        <button type="button" className={btnPrimary} onClick={() => ask("Did my last order go through?")}>Did my last order go through?</button>
        <button type="button" className={btnPrimary} onClick={() => ask("Show my last payments")}>Show my last payments</button>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) ask(text); }}>
          <label className="block space-y-2">
            <span className="block text-xl font-semibold">Or ask in your own words</span>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className={field} placeholder="Did I get my money back?" />
          </label>
          <button type="submit" className={btnSecondary} disabled={!text.trim()}>Ask</button>
        </form>
        <Link href="/" className={btnSecondary}>See my money</Link>
      </div>
    );
  }

  if (stage.name === "thinking") {
    return (
      <div className="n-col">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>Looking</h1>
        <p role="status" className="text-xl">I am asking PayPal. This takes a few seconds.</p>
        <ActivityPanel events={stage.events} />
      </div>
    );
  }

  if (stage.name === "message") {
    return (
      <div className="n-col">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>{stage.title}</h1>
        <p role="status" className="text-xl">{stage.message}</p>
        <ActivityPanel events={stage.events} />
        <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Back</button>
      </div>
    );
  }

  const { answer } = stage;
  return (
    <div className="n-col">
      <h1 ref={headingRef} tabIndex={-1} className={h1}>{answer.summary}</h1>
      <ul className="space-y-3">
        {answer.rows.map((r, i) => (
          <li key={i} className={`${card} space-y-2`}>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain" />
              <div>
                <p className="text-lg font-semibold">{r.name}</p>
                <p className="text-xl font-bold">{formatMoney(r.amountCents)} <span className="text-base font-normal">on {day(r.at)}</span></p>
              </div>
            </div>
            <p className="text-lg">North says: <strong>{r.ours}</strong></p>
            {r.paypal.checked ? (
              <p className={`rounded-xl p-2 text-lg ${r.paypal.agrees ? "bg-good-bg text-good-ink" : "bg-warn-bg text-warn-ink"}`}>
                PayPal says: <strong>{r.paypal.words}</strong>. {r.paypal.note}
              </p>
            ) : (
              <p className="text-lg">{r.paypal.why}</p>
            )}
          </li>
        ))}
      </ul>
      {answer.activity && "transactions" in answer.activity && answer.activity.transactions.length > 0 && (
        <section className={`${card} space-y-2`} aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="text-2xl font-bold">PayPal&apos;s recent activity</h2>
          <ul className="space-y-1 text-lg">
            {answer.activity.transactions.map((t) => <li key={t.id}>{formatMoney(t.amountCents)}{t.at ? ` on ${day(t.at)}` : ""}</li>)}
          </ul>
        </section>
      )}
      {answer.activity && "unavailable" in answer.activity && (
        <p className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">
          {answer.activity.unavailable === "no_permission" ? "PayPal's activity list is not turned on for this app yet." : "PayPal's activity list did not answer."} The buys above are from North&apos;s own record, checked with PayPal one by one.
        </p>
      )}
      <ActivityPanel events={stage.events} />
      <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Ask something else</button>
      <Link href="/" className={btnSecondary}>See my money</Link>
    </div>
  );
}
