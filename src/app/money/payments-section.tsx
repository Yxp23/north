"use client";
// Payment history, inside Money: ask about your orders. The helper asks PayPal (through the PayPal Agent Toolkit) and tells you in plain words.
// It can only look. Every amount comes from North's record or PayPal, never from the AI's words.
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { useMask } from "@/components/shell/mask";
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

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const AGENT = [{ name: "Payments helper", ai: true, did: "Asked PayPal about your orders with the PayPal Agent Toolkit, read-only. Every amount is PayPal's or North's own." }];

export function PaymentsSection() {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState("");
  const m = useMask();

  async function ask(question: string) {
    setStage({ name: "thinking", events: [] });
    const r = await postAgent<PaymentsOutcome>("/api/concierge/payments", { question }, (events) => setStage({ name: "thinking", events }));
    const p = r.payload;
    if (!p) setStage({ name: "message", title: "I couldn't look that up", message: r.error ?? "That did not work. Nothing was changed. Try again.", events: r.events });
    else if (p.kind === "answer") setStage({ name: "answer", answer: p, events: r.events });
    else if (p.kind === "none") setStage({ name: "message", title: "Nothing yet", message: p.message, events: r.events });
    else setStage({ name: "message", title: "I couldn't look that up", message: p.message, events: r.events });
  }

  return (
    <section aria-labelledby="pay-h" className="n-stack">
      <h2 id="pay-h">Payment history</h2>
      <p>Ask about your orders. I look at PayPal for you. I can only look. I can&apos;t pay or change anything.</p>

      {stage.name === "ask" && (
        <div className="n-stack">
          <button type="button" className={btnPrimary} onClick={() => ask("Did my last order go through?")}>Did my last order go through?</button>
          <button type="button" className={btnSecondary} onClick={() => ask("Show my last payments")}>Show my last payments</button>
          <form className="n-stack" onSubmit={(e) => { e.preventDefault(); if (text.trim()) ask(text); }}>
            <label className="block">
              <span className="n-label">Or ask in your own words</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className="n-field" placeholder="Did I get my money back?" />
            </label>
            <button type="submit" className={btnSecondary} disabled={!text.trim()}>Ask</button>
          </form>
        </div>
      )}

      {stage.name === "thinking" && (
        <div className="n-stack">
          <p role="status" className="n-note n-note-quiet"><span>I am asking PayPal. This takes a few seconds.</span></p>
          <ActivityPanel events={stage.events} agents={AGENT} />
        </div>
      )}

      {stage.name === "message" && (
        <div className="n-stack">
          <h3>{stage.title}</h3>
          <p role="status" className="n-note n-note-quiet"><span>{stage.message}</span></p>
          <ActivityPanel events={stage.events} agents={AGENT} />
          <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>Back</button>
        </div>
      )}

      {stage.name === "answer" && (
        <div className="n-stack">
          <h3>{stage.answer.summary}</h3>
          <ul className="n-stack">
            {stage.answer.rows.map((r, i) => (
              <li key={i} className={`${card} n-stack`} style={{ gap: 10 }}>
                <div className="n-rowitem">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.imageUrl} alt="" className="n-thumb" />
                  <div>
                    <p className="text-lg font-semibold">{m.item(r.name)}</p>
                    <p className="text-xl">{formatMoney(r.amountCents)} <span className="text-base">on {day(r.at)}</span></p>
                  </div>
                </div>
                <p className="text-lg">North says: <strong>{r.ours}</strong></p>
                {r.paypal.checked ? (
                  <p className={`n-note ${r.paypal.agrees ? "n-note-good" : "n-note-wait"}`}>
                    {r.paypal.agrees ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
                    <span>PayPal says: <strong>{r.paypal.words}</strong>. {r.paypal.note}</span>
                  </p>
                ) : (
                  <p className="text-lg">{r.paypal.why}</p>
                )}
              </li>
            ))}
          </ul>
          {stage.answer.activity && "transactions" in stage.answer.activity && stage.answer.activity.transactions.length > 0 && (
            <div className={`${card} n-stack`} style={{ gap: 8 }}>
              <h3>PayPal&apos;s recent activity</h3>
              <ul className="text-lg">{stage.answer.activity.transactions.map((t) => <li key={t.id}>{formatMoney(t.amountCents)}{t.at ? ` on ${day(t.at)}` : ""}</li>)}</ul>
            </div>
          )}
          {stage.answer.activity && "unavailable" in stage.answer.activity && (
            <p className="n-note n-note-wait"><TriangleAlert aria-hidden="true" /><span>{stage.answer.activity.unavailable === "no_permission" ? "PayPal's activity list is not turned on for this app yet." : "PayPal's activity list did not answer."} The buys above are from North&apos;s own record, checked with PayPal one by one.</span></p>
          )}
          <ActivityPanel events={stage.events} agents={AGENT} />
          <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>Ask something else</button>
        </div>
      )}
    </section>
  );
}
