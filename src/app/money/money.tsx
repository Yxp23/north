"use client";
// My money: this week's numbers, your last buys, and the doors to My rules, Payments and Assistants. Log out lives at the bottom.
import { ChevronRight, CreditCard, ListChecks, ShieldCheck, Wallet, Bot, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { card } from "@/components/classes";
import { BigMoney, RealThingsLine } from "@/components/money";
import { SpeakButton } from "@/components/shell/speak";
import { Empty, ErrorNote, Loading } from "@/components/states";
import { formatMoney } from "@/lib/format";
import { DemoTools, PurchaseRow, useSummary } from "../summary-parts";

function Hub({ href, Icon, title, text }: { href: string; Icon: LucideIcon; title: string; text: string }) {
  return (
    <Link href={href} className={card} style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 16 }}>
      <span className="ng-product-image" style={{ width: 56, height: 56, borderRadius: 16 }}><Icon aria-hidden="true" size={26} strokeWidth={1.5} /></span>
      <span style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 19, fontWeight: 500 }}>{title}</strong>
        <span style={{ color: "var(--n-muted)" }}>{text}</span>
      </span>
      <ChevronRight aria-hidden="true" style={{ flexShrink: 0 }} />
    </Link>
  );
}

export function MoneyPage() {
  const { data, error, load } = useSummary();
  const title = (
    <div className="ng-page-title" style={{ gridColumn: "1 / -1" }}>
      <div className="ng-eyebrow">My money</div>
      <h1>Your money,<br />clearly.</h1>
    </div>
  );
  if (!data) return <div className="ng-split" style={{ display: "block" }}>{title}{error ? <ErrorNote what="your money" onRetry={load} /> : <Loading what="your money" />}</div>;

  const spentPct = data.weeklyBudgetCents > 0 ? Math.min(100, Math.round((data.spentThisWeekCents / data.weeklyBudgetCents) * 100)) : 100;
  const hear = `You have ${formatMoney(data.leftCents)} left to spend this week. Your plan is ${formatMoney(data.weeklyBudgetCents)} and you have spent ${formatMoney(data.spentThisWeekCents)}. ${formatMoney(data.protectedCents)} for rent and bills stays safe.`;

  return (
    <div className="ng-split" style={{ rowGap: 22 }}>
      {title}
      <div className="n-stack" style={{ gap: 26 }}>
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
      </div>

      <div className="n-stack" style={{ gap: 14 }}>
        <h2 className="ng-vh">Open</h2>
        <Hub href="/rules" Icon={ListChecks} title="My rules" text="See them, change them, or add one in your own words." />
        <Hub href="/assistants" Icon={Bot} title="Assistants" text="AI assistants you connected, and what they asked for." />
        <Hub href="/payments" Icon={CreditCard} title="Payments" text="Did my last order go through? Ask in your own words." />
        <Hub href="/connect" Icon={Wallet} title={data.paypalSaved ? "My saved PayPal" : "Connect PayPal"} text={data.paypalSaved ? "This is how North pays, after the Guardian says yes." : "You need it to buy things."} />
        {data.demoMode && <DemoTools onChange={load} deployed={!!data.demoDeployment} />}
      </div>
    </div>
  );
}
