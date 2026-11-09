"use client";
// "Change or remove a rule", by hand (no AI). One decision per screen:
//   pick what to do -> change it (or confirm removing it) -> done.
// Stricter starts right away. Weaker, or off, waits one day. The screen says which BEFORE you save,
// using the same code the server uses, and the server checks it all again.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { hourLabel } from "@/lib/guardian/rules";
import type { BigBuyRule, LateNightRule, Strength } from "@/lib/guardian";
import type { ChangeResult } from "@/lib/rules/change";
import { bigBuyTiming, lateNightTiming } from "@/lib/rules/compare";
import type { RuleLine } from "@/lib/rules/summary";
import type { RuleKind } from "@/lib/rules/types";
import { WAITS } from "../../choices";
import { StrengthChoice } from "../../strength-choice";
import { whenPlain } from "../../strength-copy";

type Rule = BigBuyRule | LateNightRule;
type Stage =
  | { name: "loading" }
  | { name: "missing" }
  | { name: "menu"; line: RuleLine }
  | { name: "edit"; line: RuleLine }
  | { name: "remove"; line: RuleLine }
  | { name: "saving" }
  | { name: "error"; message: string }
  | { name: "done"; result: Extract<ChangeResult, { ok: true }> };

const h1 = "text-3xl font-bold outline-none";
const field = "n-field";
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function ChangeRule({ kind }: { kind: RuleKind }) {
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The form's values, started from the rule that is in force now.
  const [dollars, setDollars] = useState("");
  const [after, setAfter] = useState(21);
  const [until, setUntil] = useState(5);
  const [strength, setStrength] = useState<Strength>("gentle");
  const [waitHours, setWaitHours] = useState(24);

  useEffect(() => {
    let alive = true;
    fetch("/api/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { rules: RuleLine[] }) => {
        if (!alive) return;
        const line = j.rules.find((l) => l.kind === kind);
        if (!line || !line.rule) return setStage({ name: "missing" });
        const rule = line.rule;
        if ("cents" in rule) setDollars(String(rule.cents / 100));
        else {
          setAfter(rule.afterHour);
          setUntil(rule.untilHour);
        }
        setStrength(rule.strength);
        setWaitHours(rule.waitHours ?? 24);
        setStage({ name: "menu", line });
      })
      .catch(() => alive && setStage({ name: "error", message: "I can't load your rule right now. Please try again." }));
    return () => {
      alive = false;
      // Next keeps a page you left. Start from "loading" next time, so an old screen never shows.
      setStage({ name: "loading" });
    };
  }, [kind]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  const title = kind === "big_buy" ? "Buys over an amount" : "Buys late at night";

  /** The rule the form describes, or null when the form is not filled in right. */
  function formRule(): Rule | null {
    const wait = strength === "firm" ? { waitHours } : {}; // a wait time only means something for firm
    if (kind === "big_buy") {
      const cents = Math.round(Number(dollars) * 100);
      return Number.isFinite(cents) && cents >= 100 && cents <= 10_000_000 ? { cents, strength, ...wait } : null;
    }
    return after !== until ? { afterHour: after, untilHour: until, strength, ...wait } : null;
  }

  async function send(body: object) {
    setStage({ name: "saving" });
    try {
      const res = await fetch("/api/rules/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out: ChangeResult = await res.json();
      if (out.ok) setStage({ name: "done", result: out });
      else setStage({ name: "error", message: out.message });
    } catch {
      setStage({ name: "error", message: "Something went wrong. Nothing was changed." });
    }
  }

  switch (stage.name) {
    case "loading":
      return <p role="status" className="text-xl">Loading your rule…</p>;

    case "saving":
      return <p role="status" className="text-2xl">Saving…</p>;

    case "missing":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>That rule is not on</h1>
          <p className="text-xl">There is nothing to change. You can make a new rule.</p>
          <Link href="/rules/new" className={btnPrimary}>Make a rule</Link>
          <Link href="/rules" className={btnSecondary}>Back to my rules</Link>
        </div>
      );

    case "error":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>That did not work</h1>
          <p role="alert" className="text-xl">{stage.message}</p>
          <Link href="/rules" className={btnPrimary}>Back to my rules</Link>
        </div>
      );

    case "menu":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>What do you want to do?</h1>
          <div className={`${card} space-y-1`}>
            <p className="text-lg font-semibold">Your rule now</p>
            <p className="text-xl">{stage.line.text}</p>
          </div>
          <button type="button" className={btnPrimary} onClick={() => setStage({ name: "edit", line: stage.line })}>Change this rule</button>
          <button type="button" className={btnSecondary} onClick={() => setStage({ name: "remove", line: stage.line })}>Remove this rule</button>
          <Link href="/rules" className={btnSecondary}>Back to my rules</Link>
        </div>
      );

    case "edit": {
      const next = formRule();
      const now = stage.line.rule as Rule;
      // Same code as the server: is the change stricter (starts now) or weaker (waits a day)?
      const timing = !next ? null : kind === "big_buy" ? bigBuyTiming(now as BigBuyRule, next as BigBuyRule) : lateNightTiming(now as LateNightRule, next as LateNightRule);
      return (
        <form className="n-col" onSubmit={(e) => { e.preventDefault(); if (next) send({ action: "set", rule: { kind, ...next } }); }}>
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Change this rule</h1>
          <p className="text-xl">{title}</p>

          {kind === "big_buy" ? (
            <label className="block space-y-1">
              <span className="block text-lg font-semibold">Wait on buys over how many dollars?</span>
              <input type="number" inputMode="decimal" min={1} step="0.01" value={dollars} onChange={(e) => setDollars(e.target.value)} className={field} />
            </label>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="block text-lg font-semibold">Start waiting at</span>
                <select value={after} onChange={(e) => setAfter(Number(e.target.value))} className={field}>
                  {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="block text-lg font-semibold">Stop waiting at</span>
                <select value={until} onChange={(e) => setUntil(Number(e.target.value))} className={field}>
                  {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
              </label>
            </>
          )}

          <fieldset className={`${card} n-stack`}>
            <legend className="px-1 text-xl font-semibold">How strong should it be?</legend>
            <StrengthChoice name="strength" kind={kind} value={strength} onChange={setStrength} />
            {strength === "firm" && (
              <label className="block space-y-1">
                <span className="block text-lg font-semibold">How long should I wait?</span>
                <select value={waitHours} onChange={(e) => setWaitHours(Number(e.target.value))} className={field}>
                  {[...WAITS, ...(WAITS.some((w) => w.h === waitHours) ? [] : [{ h: waitHours, t: `${waitHours} hours` }])].map((w) => <option key={w.h} value={w.h}>{w.t}</option>)}
                </select>
              </label>
            )}
          </fieldset>

          {!next && <p role="status" className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">{kind === "big_buy" ? "Type an amount of $1 or more." : "Pick two different times."}</p>}
          {timing === "now" && <p role="status" className="rounded-xl bg-good-bg p-3 text-lg text-good-ink">This is as strong as your rule now, or stronger. It starts right away.</p>}
          {timing === "in_a_day" && (
            <p role="status" className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">
              This makes your rule weaker, so it starts tomorrow. Until then, your old rule stays.
            </p>
          )}
          <button type="submit" className={btnPrimary} disabled={!next}>Save this change</button>
          <button type="button" className={btnSecondary} onClick={() => setStage({ name: "menu", line: stage.line })}>Go back</button>
        </form>
      );
    }

    case "remove":
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Remove this rule?</h1>
          <div className={card}>
            <p className="text-xl">{stage.line.text}</p>
          </div>
          <p className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">
            I will turn it off tomorrow. Until then, it stays.
          </p>
          <button type="button" className={btnPrimary} onClick={() => send({ action: "remove", kind })}>Yes, turn it off tomorrow</button>
          <button type="button" className={btnSecondary} onClick={() => setStage({ name: "menu", line: stage.line })}>No, keep it</button>
        </div>
      );

    case "done": {
      const r = stage.result;
      return (
        <div className="n-col">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>{r.changed ? "Done" : "Nothing changed"}</h1>
          <div className={`${card} space-y-1`}>
            {r.text && <p className="text-xl">{r.text}</p>}
            <p className="text-lg">{r.changed && !r.startsNow ? (r.removed ? "Done. This rule turns off tomorrow. Until then, it stays." : "Saved. This makes the rule weaker, so it starts tomorrow. Until then, your old rule stays.") : r.message}</p>
            {r.changed && !r.startsNow && <p className="text-lg font-semibold">It starts {whenPlain(r.startsAt)}.</p>}
          </div>
          <Link href="/rules" className={btnPrimary}>See my rules</Link>
        </div>
      );
    }
  }
}
