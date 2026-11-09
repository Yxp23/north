"use client";
// Home: the approved composition. A hero with "Find an item", the money for this week, a saved item, and a short note that the rules are on.
// Anything that needs the person (an assistant's one-tap card, price news) comes first. Every number comes from the server's summary.
import { ArrowUpRight, Bookmark, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { card } from "@/components/classes";
import { BigMoney, RealThingsLine } from "@/components/money";
import { ErrorNote, Loading } from "@/components/states";
import { SpeakButton } from "@/components/shell/speak";
import { formatMoney } from "@/lib/format";
import { AskRow, NoticeRow, useSummary, when } from "./summary-parts";

export function Home() {
  const { data, error, load } = useSummary();
  // What the person just answered on an assistant's card. It stays on screen after the card goes away.
  const [answered, setAnswered] = useState("");

  if (!data) return error ? <ErrorNote what="your money" onRetry={load} /> : <Loading what="your money" />;

  const spentPct = data.weeklyBudgetCents > 0 ? Math.min(100, Math.round((data.spentThisWeekCents / data.weeklyBudgetCents) * 100)) : 100;
  const first = data.waitingList[0];
  const hear = `You have ${formatMoney(data.leftCents)} left to spend this week. ${formatMoney(data.protectedCents)} for rent and bills stays safe. I can't spend it.`;
  const needsYou = data.assistantAsks.length > 0 || data.priceNotices.length > 0 || !data.paypalSaved || !!answered || error;

  return (
    <div className="ng-home">
      {needsYou && (
        <div className="ng-wide n-stack">
          {error && <p role="status" className="n-note n-note-wait">I could not check for news just now. I will try again.</p>}
          {!data.paypalSaved && (
            <div role="note" className="n-note n-note-wait">
              <Wallet aria-hidden="true" />
              <div className="n-stack" style={{ gap: 8 }}>
                <p><strong>PayPal is not connected yet.</strong> You need it to buy things.</p>
                <Link href="/connect" className="n-btn n-btn-secondary n-btn-auto">Connect PayPal</Link>
              </div>
            </div>
          )}
          {answered && <p role="status" className="n-note n-note-good">{answered}</p>}
          {data.assistantAsks.length > 0 && (
            <section aria-labelledby="asks-h" className="n-stack">
              <h2 id="asks-h">Your assistant is asking</h2>
              <ul className="n-stack" aria-live="polite">
                {data.assistantAsks.map((a) => <AskRow key={a.id} a={a} onChange={load} onAnswered={setAnswered} />)}
              </ul>
            </section>
          )}
          {data.priceNotices.length > 0 && (
            <section aria-labelledby="news-h" className="n-stack">
              <h2 id="news-h">Price news</h2>
              <ul className="n-stack" aria-live="polite">
                {data.priceNotices.map((n) => <NoticeRow key={n.id} n={n} onChange={load} />)}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="ng-hero">
        <div className="ng-eyebrow">Your week with North</div>
        <h1>What are you<br />looking for?</h1>
        <p className="ng-intro">Shop with a little help from North.</p>
        <Link href="/find" className="ng-find n-btn n-btn-primary">Find an item <ArrowUpRight aria-hidden="true" /></Link>
      </div>

      <section className="ng-money" aria-labelledby="left-h">
        <div className="ng-money-top"><span id="left-h">Left to spend this week</span><Wallet aria-hidden="true" /></div>
        <BigMoney cents={data.leftCents} label="Left to spend this week" />
        <RealThingsLine cents={data.leftCents} />
        <div role="img" aria-label={`You have spent ${spentPct} percent of this week's plan`} className="ng-bar"><div style={{ width: `${spentPct}%` }} /></div>
        <p className="ng-real" style={{ margin: "8px 0 14px" }}>Your plan this week is {formatMoney(data.weeklyBudgetCents)}. You have spent {formatMoney(data.spentThisWeekCents)}.</p>
        <div className="ng-safe"><ShieldCheck aria-hidden="true" /><span>{formatMoney(data.protectedCents)} for rent and bills stays safe. I can&apos;t spend it.</span></div>
        <div style={{ marginTop: 14 }}><SpeakButton text={hear} label="Hear my money" /></div>
      </section>

      <section className="ng-saved-section" aria-labelledby="saved-h" style={{ minWidth: 0 }}>
        <div className="ng-section"><h2 id="saved-h" style={{ fontSize: "inherit" }}>Saved for later</h2><Link href="/saved" className="n-link">View saved</Link></div>
        {first ? (
          <Link href={`/shop/${first.productId}`} className="ng-saved">
            <span className="ng-product-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={first.imageUrl} alt="" />
            </span>
            <span className="ng-product-copy">
              {first.name}
              <strong>{formatMoney(first.amountCents)}</strong>
              <small>{first.ready ? "Ready. You can buy it." : `I'll remind you. Ready ${when(first.remindAt)}.`}{data.waitingList.length > 1 ? ` And ${data.waitingList.length - 1} more saved.` : ""}</small>
            </span>
          </Link>
        ) : (
          <div className={`${card} n-rowitem`} style={{ minHeight: 120 }}>
            <Bookmark aria-hidden="true" size={32} />
            <p>Nothing is saved yet. When you wait on something, it shows here.</p>
          </div>
        )}
      </section>

      <div className="ng-trust">
        <div className="ng-trust-title"><ShieldCheck aria-hidden="true" /><h2 style={{ fontSize: "inherit" }}>Your rules are on</h2></div>
        <p>North checks the item, seller, and total before you pay.</p>
        {data.buyNowThisWeek > 0 && <p>You chose Buy now {data.buyNowThisWeek} {data.buyNowThisWeek === 1 ? "time" : "times"} this week.</p>}
        <Link href="/rules" className="n-link">See my spending rules</Link>
      </div>
    </div>
  );
}
