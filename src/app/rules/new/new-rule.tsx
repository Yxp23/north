"use client";
// "My rules in my own words". One decision per screen:
//   write it -> (one question if something is missing) -> "Is that right?" -> pick Gentle / Firm / Locked -> saved.
// The AI only understands the words. The sentences you read, the numbers in them and the checks that stop a
// rule from getting weaker are all code. A saved rule is always stricter, so it starts right away.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import type { ConciergePayload, ProposalItem } from "@/lib/agents/concierge/concierge";
import type { StepEvent } from "@/lib/agents/loop";
import type { Strength } from "@/lib/guardian";
import { dollarsLabel, windowLabel } from "@/lib/rules/describe";
import type { SaveResult } from "@/lib/rules/save";
import type { SaveRule } from "@/lib/rules/types";
import { STRENGTHS, WAITS } from "../choices";
import { StrengthChoice } from "../strength-choice";

type Proposal = Extract<ConciergePayload, { kind: "proposal" }>;
type Choice = { strength?: Strength; waitHours: number };

type Stage =
  | { name: "write" }
  | { name: "thinking" }
  | { name: "question"; question: string; missing: "amount" | "hour" }
  | { name: "cannot"; message: string; reasons: string[] }
  | { name: "error"; message: string }
  | { name: "confirm"; proposal: Proposal }
  | { name: "strength"; items: ProposalItem[]; choices: Record<string, Choice> }
  | { name: "saving" }
  | { name: "saved"; result: Extract<SaveResult, { ok: true }> };


const itemTitle = (i: ProposalItem) =>
  i.rule.kind === "big_buy" ? `Buys over ${dollarsLabel(i.rule.cents)}` : `Buys from ${windowLabel(i.rule.afterHour, i.rule.untilHour)}`;

/** Reads the streamed lines: each is a step for the panel, or the final result. */
async function askConcierge(body: object, onStep: (s: StepEvent) => void): Promise<ConciergePayload> {
  const res = await fetch("/api/concierge/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    return { kind: "error", message: j?.error ?? "Something went wrong. Please try again." };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ConciergePayload | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "step") onStep({ label: msg.label, state: msg.state, detail: msg.detail, warn: msg.warn });
      else if (msg.type === "result") result = msg.payload;
    }
  }
  return result ?? { kind: "error", message: "Something went wrong. Please try again." };
}

export function NewRule({ initialWords = "" }: { initialWords?: string }) {
  const [stage, setStage] = useState<Stage>({ name: "write" });
  const [words, setWords] = useState(initialWords);
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<StepEvent[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  async function ask(followUp?: { missing: "amount" | "hour"; answer: string }) {
    setEvents([]);
    setStage({ name: "thinking" });
    const payload = await askConcierge({ text: words, followUp }, (s) => setEvents((e) => [...e, s]));
    if (payload.kind === "needs_info") setStage({ name: "question", question: payload.question, missing: payload.missing });
    else if (payload.kind === "cannot") setStage({ name: "cannot", message: payload.message, reasons: payload.reasons });
    else if (payload.kind === "error") setStage({ name: "error", message: payload.message });
    else setStage({ name: "confirm", proposal: payload });
    setAnswer("");
  }

  function startAgain() {
    setWords("");
    setStage({ name: "write" });
  }

  function goToStrength(proposal: Proposal) {
    const items = proposal.items.filter((i) => i.status !== "looser");
    const choices: Record<string, Choice> = {};
    for (const i of items) {
      const hint = i.rule.suggested;
      choices[i.id] = { strength: hint && (!i.minStrength || STRENGTHS.indexOf(hint) >= STRENGTHS.indexOf(i.minStrength)) ? hint : undefined, waitHours: i.rule.waitHours ?? 24 };
    }
    setStage({ name: "strength", items, choices });
  }

  async function save(items: ProposalItem[], choices: Record<string, Choice>) {
    setStage({ name: "saving" });
    const rules: SaveRule[] = items.map((i) => {
      const c = choices[i.id];
      const strength = c.strength as Strength;
      const waitHours = strength === "firm" ? c.waitHours : undefined;
      return i.rule.kind === "big_buy"
        ? { kind: "big_buy", cents: i.rule.cents, strength, ...(waitHours ? { waitHours } : {}) }
        : { kind: "late_night", afterHour: i.rule.afterHour, untilHour: i.rule.untilHour, strength, ...(waitHours ? { waitHours } : {}) };
    });
    try {
      const res = await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
      const out: SaveResult = await res.json();
      if (out.ok) setStage({ name: "saved", result: out });
      else setStage({ name: "error", message: out.message });
    } catch {
      setStage({ name: "error", message: "Something went wrong. Nothing was saved." });
    }
  }

  const h1 = "text-3xl font-bold outline-none";

  switch (stage.name) {
    case "write":
      return (
        <form className="n-col" onSubmit={(e) => { e.preventDefault(); if (words.trim()) ask(); }}>
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Make a rule</h1>
          <label className="block space-y-2">
            <span className="block text-xl">Write your rule in your own words.</span>
            <span className="block text-lg text-muted">For example: &quot;Don&apos;t let me buy big things late at night.&quot;</span>
            <textarea
              value={words}
              onChange={(e) => setWords(e.target.value)}
              maxLength={500}
              rows={4}
              className="min-h-32 w-full rounded-2xl border-2 border-line bg-card p-4 text-xl"
            />
          </label>
          <button type="submit" className={btnPrimary} disabled={!words.trim()}>Next</button>
          <Link href="/rules" className={btnSecondary}>Back to my rules</Link>
        </form>
      );

    case "thinking":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>One moment</h1>
          <ActivityPanel events={events} />
        </div>
      );

    case "question":
      return (
        <form className="n-col" onSubmit={(e) => { e.preventDefault(); if (answer.trim()) ask({ missing: stage.missing, answer }); }}>
          <h1 ref={headingRef} tabIndex={-1} className={h1}>One question</h1>
          <label className="block space-y-2">
            <span className="block text-xl">{stage.question}</span>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={200} className="min-h-14 w-full rounded-2xl border-2 border-line bg-card px-4 text-xl" />
          </label>
          <button type="submit" className={btnPrimary} disabled={!answer.trim()}>Next</button>
          <button type="button" className={btnSecondary} onClick={startAgain}>Start again</button>
        </form>
      );

    case "cannot":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>{stage.message}</h1>
          {stage.reasons.map((r) => <p key={r} className="text-xl">{r}</p>)}
          <ActivityPanel events={events} />
          <button type="button" className={btnPrimary} onClick={startAgain}>Try again</button>
          <Link href="/rules" className={btnSecondary}>Back to my rules</Link>
        </div>
      );

    case "error":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>That did not work</h1>
          <p role="alert" className="text-xl">{stage.message}</p>
          <button type="button" className={btnPrimary} onClick={startAgain}>Try again</button>
          <Link href="/rules" className={btnSecondary}>Back to my rules</Link>
        </div>
      );

    case "confirm": {
      const { proposal } = stage;
      const ok = proposal.items.filter((i) => i.status !== "looser");
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Is that right?</h1>
          {proposal.items.map((i) => (
            <div key={i.id} className={`${card} space-y-2`}>
              {i.status === "looser" ? (
                <p role="alert" className="rounded-xl bg-bad-bg p-3 text-lg text-bad-ink">{i.blockedText}</p>
              ) : (
                <p className="text-xl">{i.readBack}</p>
              )}
            </div>
          ))}
          {proposal.notes.map((n) => <p key={n} className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">{n}</p>)}
          <ActivityPanel events={events} />
          {ok.length > 0 && <button type="button" className={btnPrimary} onClick={() => goToStrength(proposal)}>{ok.length < proposal.items.length ? "Yes, keep the rule I can make" : "Yes, that's right"}</button>}
          <button type="button" className={ok.length > 0 ? btnSecondary : btnPrimary} onClick={startAgain}>No, start again</button>
        </div>
      );
    }

    case "strength": {
      const { items, choices } = stage;
      const ready = items.every((i) => choices[i.id].strength);
      const set = (id: string, patch: Partial<Choice>) => setStage({ ...stage, choices: { ...choices, [id]: { ...choices[id], ...patch } } });
      return (
        <form className="n-col" onSubmit={(e) => { e.preventDefault(); if (ready) save(items, choices); }}>
          <h1 ref={headingRef} tabIndex={-1} className={h1}>How strong should it be?</h1>
          <p className="text-lg">Pick one. Each one says what I will do.</p>
          {items.map((i) => {
            const c = choices[i.id];
                        return (
              <fieldset key={i.id} className={`${card} n-stack`}>
                <legend className="px-1 text-xl font-semibold">{itemTitle(i)}</legend>
                <StrengthChoice name={`strength-${i.id}`} kind={i.rule.kind} value={c.strength} onChange={(st) => set(i.id, { strength: st })} minStrength={i.minStrength ?? undefined} suggested={i.rule.suggested ?? undefined} />
                {c.strength === "firm" && (
                  <label className="block space-y-1">
                    <span className="block text-lg font-semibold">How long should I wait?</span>
                    <select value={c.waitHours} onChange={(e) => set(i.id, { waitHours: Number(e.target.value) })} className="min-h-14 w-full rounded-xl border-2 border-line bg-card px-3 text-lg">
                      {WAITS.map((w) => <option key={w.h} value={w.h}>{w.t}</option>)}
                    </select>
                  </label>
                )}
              </fieldset>
            );
          })}
          <p className="text-lg">A new rule starts right away.</p>
          <button type="submit" className={btnPrimary} disabled={!ready}>{items.length > 1 ? "Save my rules" : "Save my rule"}</button>
          <button type="button" className={btnSecondary} onClick={startAgain}>Start again</button>
        </form>
      );
    }

    case "saving":
      return <p role="status" className="text-2xl">Saving…</p>;

    case "saved":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>{stage.result.saved.length ? "Saved" : "You already have that"}</h1>
          {stage.result.saved.map((s) => (
            <div key={s.kind} className={`${card} space-y-1`}>
              <p className="text-xl">{s.text}</p>
              <p className="text-lg">It started right away.</p>
            </div>
          ))}
          {!stage.result.saved.length && <p className="text-xl">{stage.result.message}</p>}
          <Link href="/rules" className={btnPrimary}>See my rules</Link>
        </div>
      );
  }
}
