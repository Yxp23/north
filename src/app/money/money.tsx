"use client";
// Money: what you have this week, your rules, your payment history, and your saved PayPal. One place for everything about your money.
import { Bell, Clock, Lock, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { card } from "@/components/classes";
import { BigMoney, RealThingsLine } from "@/components/money";
import { SpeakButton } from "@/components/shell/speak";
import { Empty, ErrorNote, Loading } from "@/components/states";
import { formatMoney } from "@/lib/format";
import type { Strength } from "@/lib/guardian";
import type { RuleLine } from "@/lib/rules/summary";
import { PurchaseRow, useSummary } from "../summary-parts";
import { setupFinished } from "@/lib/setup/finished";
import { MoneyStep } from "../welcome/setup";
import { readSetup, subscribeSetup } from "../welcome/progress";
import { MySizes } from "./my-sizes";
import { PaymentsSection } from "./payments-section";
import { useSyncExternalStore } from "react";

const STRENGTH: Record<Strength, { label: string; cls: string; Icon: LucideIcon }> = {
  gentle: { label: "Gentle", cls: "n-chip-good", Icon: Bell },
  firm: { label: "Firm", cls: "n-chip-wait", Icon: Clock },
  locked: { label: "Locked", cls: "n-chip-stop", Icon: Lock },
};

function RulesGlance() {
  const [rules, setRules] = useState<RuleLine[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setRules(j.rules))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);
  return (
    <section aria-labelledby="rules-h" className="n-stack">
      <h2 id="rules-h">My rules</h2>
      <p>The rules you set. North follows them before every payment.</p>
      {error ? <ErrorNote what="your rules" /> : !rules ? <Loading what="your rules" /> : rules.length === 0 ? <Empty>You have no wait rules yet.</Empty> : (
        <ul className="n-stack">
          {rules.map((r) => {
            const s = r.strength ? STRENGTH[r.strength] : null;
            return (
              <li key={r.kind} className={`${card} n-stack`} style={{ gap: 8 }}>
                {s && <p className={`n-chip ${s.cls}`} style={{ justifySelf: "start" }}><s.Icon aria-hidden="true" />{s.label}</p>}
                <p className="n-t-lg">{r.text}</p>
                {r.pending && <p className="n-note n-note-wait"><Clock aria-hidden="true" /><span>A change is waiting to start. See My rules to undo it.</span></p>}
                <SpeakButton text={`${s ? `${s.label} rule. ` : ""}${r.text}`} label="Hear this rule" />
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/rules" className="n-btn n-btn-secondary">See and change my rules</Link>
    </section>
  );
}

export function MoneyPage() {
  const { data, error, load } = useSummary();
  const setup = useSyncExternalStore(subscribeSetup, () => readSetup().state, () => "done");
  const title = (
    <div className="ng-page-title" style={{ gridColumn: "1 / -1" }}>
      <div className="ng-eyebrow">Money</div>
      <h1>Your money,<br />clearly.</h1>
      <p>See what you can spend, the rules that protect it, and what you have paid.</p>
    </div>
  );
  if (!data) return <div>{title}{error ? <ErrorNote what="your money" onRetry={load} /> : <Loading what="your money" />}</div>;

  const spentPct = data.weeklyBudgetCents > 0 ? Math.min(100, Math.round((data.spentThisWeekCents / data.weeklyBudgetCents) * 100)) : 100;
  const hear = `You have ${formatMoney(data.leftCents)} left to spend this week. Your plan is ${formatMoney(data.weeklyBudgetCents)} and you have spent ${formatMoney(data.spentThisWeekCents)}. ${formatMoney(data.protectedCents)} for rent and bills stays safe.`;

  return (
    <div className="ng-split" style={{ rowGap: 22 }}>
      {title}
      <div className="n-stack" style={{ gap: 34 }}>
        <section className="ng-money" aria-labelledby="left-h">
          <div className="ng-money-top"><span id="left-h">Left to spend this week</span><Wallet aria-hidden="true" /></div>
          <BigMoney cents={data.leftCents} label="Left to spend this week" />
          <RealThingsLine cents={data.leftCents} />
          <div role="img" aria-label={`You have spent ${spentPct} percent of this week's plan`} className="ng-bar"><div style={{ width: `${spentPct}%` }} /></div>
          <p className="ng-real" style={{ margin: "8px 0 14px" }}>Your plan this week is {formatMoney(data.weeklyBudgetCents)}. You have spent {formatMoney(data.spentThisWeekCents)}.</p>
          <div className="ng-safe"><ShieldCheck aria-hidden="true" /><span>{formatMoney(data.protectedCents)} for rent and bills stays safe. I can&apos;t spend it.</span></div>
          <div style={{ marginTop: 14 }}><SpeakButton text={hear} label="Hear my money" /></div>
        </section>

        <section aria-labelledby="buys-h" className="n-stack">
          <h2 id="buys-h">Your last buys</h2>
          {data.purchases.length === 0 ? (
            <Empty>No buys yet. When you buy something, the receipt shows here.</Empty>
          ) : (
            <ul className="n-stack" aria-live="polite">{data.purchases.map((p) => <PurchaseRow key={p.id} p={p} onChange={load} />)}</ul>
          )}
        </section>


        <section aria-labelledby="change-h" className="n-stack">
          <h2 id="change-h">Change my weekly money</h2>
          <p>Spending less, or keeping more safe, starts right away. Spending more, or keeping less safe, starts tomorrow, so you can change your mind.</p>
          <MoneyStep key={`${data.weeklyBudgetCents}-${data.protectedCents}`} embedded weekly={data.weeklyBudgetCents} protectedCents={data.protectedCents} pending={data.pendingMoney} onSaved={load} />
        </section>

        <PaymentsSection />
      </div>

      <div className="n-stack" style={{ gap: 34 }}>
        <RulesGlance />
        <section aria-labelledby="pp-h" className="n-stack">
          <h2 id="pp-h">My saved PayPal</h2>
          <p>{data.paypalSaved ? "This is how North pays, after your rules say yes. North never shows your PayPal details." : "You need to save a PayPal before North can pay for anything."}</p>
          <Link href="/connect" className="n-btn n-btn-secondary">{data.paypalSaved ? "See my saved PayPal" : "Connect PayPal"}</Link>
        </section>
        <MySizes />
        {setup !== "done" && !setupFinished(data) && (
          <section aria-labelledby="setup-h" className="n-stack">
            <h2 id="setup-h">Setting up North</h2>
            <p>Three short steps: PayPal, your weekly money, and a first rule. You can skip any of them.</p>
            <Link href="/welcome" className="n-btn n-btn-secondary">{setup === "started" ? "Keep going" : "Start setup"}</Link>
          </section>
        )}
      </div>
    </div>
  );
}
