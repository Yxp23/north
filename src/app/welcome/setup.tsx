"use client";
// First-run setup, in three short steps: connect PayPal, set the weekly money and the rent-and-bills money, write a first rule in your own words.
// Every step can be skipped. It remembers where you stopped (on this device) and can be run again from Demo tools.
import { ArrowRight, Check, FilePlus2, PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { btnPrimary, btnSecondary } from "@/components/classes";
import { ErrorNote, Loading } from "@/components/states";
import { formatMoney } from "@/lib/format";
import { Connect } from "../connect/connect";
import { useSummary } from "../summary-parts";
import { readSetup, subscribeSetup, writeSetup } from "./progress";

const SERVER_PROGRESS = { state: "todo" as const, step: 1 as const };
const TITLES = ["Connect PayPal", "Your weekly money", "Your first rule"] as const;

export function WelcomeSetup() {
  const router = useRouter();
  const progress = useSyncExternalStore(subscribeSetup, readSetup, () => SERVER_PROGRESS);
  const { data, error, load } = useSummary();
  const step = progress.step;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [step]);

  const go = (n: 1 | 2 | 3) => writeSetup({ state: "started", step: n });
  const finish = (state: "done" | "skipped") => {
    writeSetup({ state, step });
    router.push("/");
  };

  return (
    <div className="n-col" style={{ maxWidth: 680 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Step {step} of 3</div>
        <h1 ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>{TITLES[step - 1]}</h1>
        <p>{step === 1 ? "North needs your PayPal to pay for things, after your rules say yes." : step === 2 ? "Tell North how much you can spend each week, and how much to keep safe for rent and bills." : "Write a rule the way you would say it. North reads it back before saving anything."}</p>
      </div>

      <ol className="wl-steps" aria-label="Setup steps">
        {TITLES.map((t, i) => (
          <li key={t} aria-current={step === i + 1 ? "step" : undefined} className={step === i + 1 ? "wl-on" : ""}>
            <span className="wl-dot" aria-hidden="true">{step > i + 1 ? <Check size={16} /> : i + 1}</span>{t}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="n-stack">
          <Connect embedded />
          <button type="button" className={btnPrimary} onClick={() => go(2)}>Next<ArrowRight aria-hidden="true" /></button>
          <button type="button" className="n-btn n-btn-quiet" onClick={() => go(2)}>Skip this step</button>
        </div>
      )}
      {step === 2 && (data ? <MoneyStep weekly={data.weeklyBudgetCents} protectedCents={data.protectedCents} onNext={() => go(3)} onBack={() => go(1)} onSaved={load} /> : error ? <ErrorNote what="your money" onRetry={load} /> : <Loading what="your money" />)}
      {step === 3 && <RuleStep onBack={() => go(2)} onDone={(words) => { writeSetup({ state: "done", step: 3 }); router.push(words ? `/rules/new?said=${encodeURIComponent(words)}` : "/"); }} />}

      <div className="n-stack" style={{ borderTop: "1px solid var(--n-line)", paddingTop: 14 }}>
        <button type="button" className="n-btn n-btn-quiet" onClick={() => finish("skipped")}>Skip setup for now</button>
        <p style={{ color: "var(--n-ink)" }}>You can change all of this later in Money and in My rules.</p>
        {progress.state !== "todo" && <Link href="/" className="n-link">Back to Home</Link>}
      </div>
    </div>
  );
}

function MoneyStep({ weekly, protectedCents, onNext, onBack, onSaved }: { weekly: number; protectedCents: number; onNext(): void; onBack(): void; onSaved(): void }) {
  const [week, setWeek] = useState(String(weekly / 100));
  const [rent, setRent] = useState(String(protectedCents / 100));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weeklyDollars: Number(week), protectedDollars: Number(rent) }) });
      const j = await r.json();
      if (r.ok) {
        setSaved(true);
        onSaved();
      } else setMessage(j.message ?? "That did not work. Nothing was changed. Try again.");
    } catch {
      setMessage("That did not work. Nothing was changed. Try again.");
    }
    setBusy(false);
  }

  return (
    <form className="n-stack" onSubmit={save}>
      <label className="n-block">
        <span className="n-label"><Wallet aria-hidden="true" size={18} style={{ display: "inline", verticalAlign: "-3px", marginRight: 8 }} />How much can you spend each week? (dollars)</span>
        <input type="number" inputMode="decimal" min={1} step="1" value={week} onChange={(e) => { setWeek(e.target.value); setSaved(false); }} className="n-field" />
      </label>
      <label className="n-block">
        <span className="n-label"><PiggyBank aria-hidden="true" size={18} style={{ display: "inline", verticalAlign: "-3px", marginRight: 8 }} />How much is for rent and bills? (dollars)</span>
        <input type="number" inputMode="decimal" min={0} step="1" value={rent} onChange={(e) => { setRent(e.target.value); setSaved(false); }} className="n-field" />
      </label>
      <p style={{ color: "var(--n-ink)" }}>North will never spend the rent and bills money. Nothing can get past that.</p>
      {message && <p role="alert" className="n-note n-note-stop"><span>{message}</span></p>}
      {saved && <p role="status" className="n-note n-note-good"><Check aria-hidden="true" /><span>Saved. You can spend {formatMoney(Math.round(Number(week) * 100))} each week. {formatMoney(Math.round(Number(rent) * 100))} is set aside.</span></p>}
      {saved ? (
        <button type="button" className={btnPrimary} onClick={onNext}>Next<ArrowRight aria-hidden="true" /></button>
      ) : (
        <button type="submit" className={btnPrimary} disabled={busy || !(Number(week) >= 1) || !(Number(rent) >= 0) || rent === ""}>{busy ? "Saving…" : "Save these"}</button>
      )}
      <button type="button" className={btnSecondary} onClick={onBack}>Back</button>
      {!saved && <button type="button" className="n-btn n-btn-quiet" onClick={onNext}>Skip this step</button>}
    </form>
  );
}

function RuleStep({ onBack, onDone }: { onBack(): void; onDone(words: string): void }) {
  const [words, setWords] = useState("");
  return (
    <form className="n-stack" onSubmit={(e) => { e.preventDefault(); if (words.trim()) onDone(words.trim()); }}>
      <label className="n-block">
        <span className="n-label"><FilePlus2 aria-hidden="true" size={18} style={{ display: "inline", verticalAlign: "-3px", marginRight: 8 }} />What rule do you want?</span>
        <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3} maxLength={300} className="n-field" placeholder="Wait a day before I buy anything over $50" />
      </label>
      <p style={{ color: "var(--n-ink)" }}>Next, North reads your rule back. You pick Gentle, Firm or Locked, and nothing is saved until you say yes.</p>
      <button type="submit" className={btnPrimary} disabled={!words.trim()}>Write my rule</button>
      <button type="button" className={btnSecondary} onClick={onBack}>Back</button>
      <button type="button" className="n-btn n-btn-quiet" onClick={() => onDone("")}>Skip. I will do this later.</button>
    </form>
  );
}
