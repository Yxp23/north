"use client";
// Home: a greeting, ONE large Ask North box with three quick buttons, then this week's money, the last time North stepped in, and a small
// peek at what is saved. Anything that needs the person (an assistant's one-tap card, price news) comes first. Every number comes from the server.
import { Photo } from "@/components/photo";
import { Bell, Bookmark, ChevronDown, ChevronRight, FilePlus2, ScanSearch, ShieldAlert, ShieldCheck, ShoppingBag, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { card } from "@/components/classes";
import { StatusBadge } from "@/components/decision-dialog";
import { BigMoney, RealThingsLine } from "@/components/money";
import { useMask } from "@/components/shell/mask";
import { SpeakButton } from "@/components/shell/speak";
import { ErrorNote, Loading } from "@/components/states";
import { formatMoney } from "@/lib/format";
import { decisionFromAnswer } from "@/lib/ui/decision-view";
import { AskNorth } from "./ask-north";
import { AskRow, NoticeRow, useSummary, when } from "./summary-parts";
import { SetupBanner } from "./welcome/setup-banner";

const hello = () => {
  const h = new Date().getHours();
  return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

const STEP_LINE: Record<string, string> = {
  wait: "I asked you to wait or buy now. Nothing was charged until you chose.",
  waitlist: "I saved it for later. Nothing was charged.",
  refuse: "I did not buy it. Nothing was charged.",
};

export function Home() {
  const { data, error, load } = useSummary();
  const m = useMask();
  // What the person just answered on an assistant's card. It stays on screen after the card goes away.
  const [answered, setAnswered] = useState("");

  if (!data) return error ? <ErrorNote what="your money" onRetry={load} /> : <Loading what="your money" />;

  const spentPct = data.weeklyBudgetCents > 0 ? Math.min(100, Math.round((data.spentThisWeekCents / data.weeklyBudgetCents) * 100)) : 100;
  const first = data.waitingList[0];
  const hear = `You have ${formatMoney(data.leftCents)} left to spend this week. ${formatMoney(data.protectedCents)} for rent and bills stays safe. I can't spend it.`;
  const needsYou = data.assistantAsks.length > 0 || data.priceNotices.length > 0 || !data.paypalSaved || !!answered || error;
  const step = data.lastStepIn;
  const stepView = step ? decisionFromAnswer({ decision: step.decision, code: step.code, reason: "" }) : null;

  return (
    <div className="ng-home">
      <SetupBanner newUser={!data.paypalSaved && data.purchases.length === 0} />
      {(data.assistantAsks.length > 0 || data.priceNotices.length > 0) && (
        <a href="#needs-you" className="n-note n-note-wait ng-wide ng-needs-banner">
          <Bell aria-hidden="true" />
          <span>
            Waiting for you:{" "}
            {[data.assistantAsks.length > 0 && `${data.assistantAsks.length} ${data.assistantAsks.length === 1 ? "question" : "questions"} from your assistant`, data.priceNotices.length > 0 && `${data.priceNotices.length} price news`].filter(Boolean).join(" and ")}. See below.
          </span>
          <ChevronDown aria-hidden="true" />
        </a>
      )}
      <div className="ng-hero n-stack" style={{ gap: 22 }}>
        <div>
          <div className="ng-eyebrow">{hello()}</div>
          <h1>What do you<br />need today?</h1>
          <p className="ng-intro">Say what you want. North helps, and your rules keep your money safe.</p>
        </div>
        <AskNorth
          variant="home"
          below={
            <div className="ng-quick" role="group" aria-label="Quick actions">
              <Link href="/find" className="n-btn n-btn-secondary"><ShoppingBag aria-hidden="true" />Find something</Link>
              <Link href="/check" className="n-btn n-btn-secondary"><ScanSearch aria-hidden="true" />Check a deal</Link>
              <Link href="/rules/new" className="n-btn n-btn-secondary"><FilePlus2 aria-hidden="true" />Add a rule</Link>
            </div>
          }
        />
      </div>

      <div className="n-stack" style={{ minWidth: 0, gap: 22 }}>
      <section className="ng-money" aria-labelledby="left-h">
        <div className="ng-money-top"><span id="left-h">Left to spend this week</span><Wallet aria-hidden="true" /></div>
        <BigMoney cents={data.leftCents} label="Left to spend this week" />
        <RealThingsLine cents={data.leftCents} />
        <div role="img" aria-label={`You have spent ${spentPct} percent of this week's plan`} className="ng-bar"><div style={{ width: `${spentPct}%` }} /></div>
        <p className="ng-real" style={{ margin: "8px 0 14px" }}>Your plan this week is {formatMoney(data.weeklyBudgetCents)}. You have spent {formatMoney(data.spentThisWeekCents)}.</p>
        <div className="ng-safe"><ShieldCheck aria-hidden="true" /><span>{formatMoney(data.protectedCents)} for rent and bills stays safe. I can&apos;t spend it.</span></div>
        <div style={{ marginTop: 14 }}><SpeakButton text={hear} label="Hear my money" /></div>
        {data.buyNowThisWeek > 0 && <p className="ng-real" style={{ margin: "12px 0 0" }}>You chose Buy now {data.buyNowThisWeek} {data.buyNowThisWeek === 1 ? "time" : "times"} this week.</p>}
      </section>

      <Link href="/activity" className="tw-card">
        <span className="tw-title">North this week<span className="ng-vh">. See everything North did for you.</span></span>
        <span className="tw-items">
          {data.thisWeek.scamsStopped > 0 && <span className="tw-item"><ShieldAlert aria-hidden="true" />Stopped {data.thisWeek.scamsStopped} {data.thisWeek.scamsStopped === 1 ? "scam" : "scams"}</span>}
          {data.thisWeek.savedForLater > 0 && <span className="tw-item"><Bookmark aria-hidden="true" />Saved {data.thisWeek.savedForLater} {data.thisWeek.savedForLater === 1 ? "thing" : "things"} for later</span>}
          {data.thisWeek.scamsStopped === 0 && data.thisWeek.savedForLater === 0 && <span className="tw-item">Nothing needed stopping yet</span>}
          <span className="tw-item"><ShieldCheck aria-hidden="true" />Rent and bills safe</span>
        </span>
        <ChevronRight aria-hidden="true" className="tw-go" />
      </Link>

        {step && stepView && (
          <section aria-labelledby="step-h" className="n-stack" style={{ gap: 10 }}>
            <div className="ng-section"><h2 id="step-h" style={{ fontSize: "inherit" }}>Last time North stepped in</h2></div>
            <div className={`${card} n-stack`} style={{ gap: 10 }}>
              <div><StatusBadge view={stepView} /></div>
              <p className="n-t-lg"><strong>{m.item(step.name)}</strong>, {formatMoney(step.amountCents)}. {STEP_LINE[step.decision]}</p>
              <p style={{ color: "var(--n-muted)" }}>{new Date(step.at).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}</p>
            </div>
          </section>
        )}

        <section aria-labelledby="saved-h" style={{ minWidth: 0 }}>
          <div className="ng-section"><h2 id="saved-h" style={{ fontSize: "inherit" }}>Saved for later</h2><Link href="/saved" className="n-link">View saved</Link></div>
          {first ? (
            <Link href="/saved" className="ng-saved" style={{ minHeight: 0, padding: 14, gap: 16 }}>
              <span className="ng-product-image" style={{ width: 72, height: 80 }}>
                <Photo src={first.imageUrl} />
              </span>
              <span className="ng-product-copy" style={{ gap: 2 }}>
                {m.item(first.name)}
                <strong style={{ fontSize: 20 }}>{formatMoney(first.amountCents)}</strong>
                <small>{first.ready ? "Ready. You can buy it." : `Ready ${when(first.remindAt)}.`}{data.waitingList.length > 1 ? ` And ${data.waitingList.length - 1} more.` : ""}</small>
              </span>
            </Link>
          ) : (
            <div className={`${card} n-rowitem`}>
              <Bookmark aria-hidden="true" size={28} />
              <p>Nothing is saved yet. When you wait on something, it shows here.</p>
            </div>
          )}
        </section>
      </div>
      {needsYou && (
        <div id="needs-you" className="ng-wide n-stack ng-needs">
          {error && <p role="status" className="n-note n-note-wait">I could not check for news just now. I will try again.</p>}
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

    </div>
  );
}
