"use client";
// "This week's money": the home screen. Asks the server again every few seconds, so a payment
// or refund that PayPal reports by webhook shows up on its own.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { setDemoHour, useDemoHour } from "@/lib/demo-hour";
import { formatMoney } from "@/lib/format";
import type { HomeSummary, PurchaseStatus, PurchaseView, WaitingView } from "@/lib/ledger/types";

type Summary = HomeSummary & { paypalSaved: boolean; demoMode: boolean };

const STATUS: Record<PurchaseStatus, { label: string; cls: string; icon: string }> = {
  paid: { label: "Paid", cls: "bg-good-bg text-good-ink", icon: "✓" },
  pending: { label: "Waiting for PayPal", cls: "bg-warn-bg text-warn-ink", icon: "…" },
  refunded: { label: "Money back", cls: "bg-warn-bg text-warn-ink", icon: "↩" },
  failed: { label: "Did not go through", cls: "bg-bad-bg text-bad-ink", icon: "✕" },
};

export function Home() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/summary", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 4000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (!data) {
    return <p role="status" className="text-xl">{error ? "I can't load your money right now. Please try again." : "Loading your money…"}</p>;
  }

  const spentPct = data.weeklyBudgetCents > 0 ? Math.min(100, Math.round((data.spentThisWeekCents / data.weeklyBudgetCents) * 100)) : 100;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">This week&apos;s money</h1>

      {error && <p role="status" className="rounded-xl bg-warn-bg p-3 text-warn-ink">I could not check for news just now. I will try again.</p>}

      {!data.paypalSaved && (
        <div role="note" className="rounded-2xl border-2 border-warn-ink bg-warn-bg p-4 text-warn-ink">
          <p className="text-lg font-semibold">PayPal is not connected yet.</p>
          <p>You need it to buy things.</p>
          <Link href="/connect" className="mt-2 inline-block rounded-lg px-1 py-2 font-semibold underline">
            Connect PayPal
          </Link>
        </div>
      )}

      <section aria-labelledby="left-h" className={card}>
        <h2 id="left-h" className="text-xl font-semibold text-muted">Left to spend this week</h2>
        <p className="text-5xl font-bold">{formatMoney(data.leftCents)}</p>
        <div
          role="img"
          aria-label={`You have spent ${spentPct} percent of this week's plan`}
          className="mt-4 h-6 w-full overflow-hidden rounded-full border border-line bg-slate-200"
        >
          <div className="h-full bg-accent" style={{ width: `${spentPct}%` }} />
        </div>
        <p className="mt-3 text-lg">
          Your plan for this week is {formatMoney(data.weeklyBudgetCents)}. You have spent {formatMoney(data.spentThisWeekCents)}.
        </p>
      </section>

      <section aria-labelledby="safe-h" className={`${card} flex items-center gap-4`}>
        <span aria-hidden="true" className="text-4xl">🔒</span>
        <div>
          <h2 id="safe-h" className="text-xl font-semibold text-muted">Saved for rent and bills</h2>
          <p className="text-3xl font-bold">{formatMoney(data.protectedCents)}</p>
          <p>This money is safe. I can&apos;t spend it.</p>
        </div>
      </section>

      <Link href="/shop" className={btnPrimary}>Shop for something</Link>

      {data.waitingList.length > 0 && (
        <section aria-labelledby="waiting-h" className="space-y-3">
          <h2 id="waiting-h" className="text-2xl font-bold">Waiting list</h2>
          <ul className="space-y-3">
            {data.waitingList.map((w) => (
              <WaitingRow key={w.id} w={w} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="buys-h" className="space-y-3">
        <h2 id="buys-h" className="text-2xl font-bold">Your last buys</h2>
        {data.purchases.length === 0 ? (
          <p className="text-lg">No buys yet.</p>
        ) : (
          <ul className="space-y-3" aria-live="polite">
            {data.purchases.map((p) => (
              <PurchaseRow key={p.id} p={p} onChange={load} />
            ))}
          </ul>
        )}
      </section>

      {data.demoMode && <DemoTools onChange={load} />}
    </div>
  );
}

// One saved buy. Waiting until the wait is over; then it can be bought like any other buy.
function WaitingRow({ w }: { w: WaitingView }) {
  const when = new Date(w.remindAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });
  return (
    <li className={`${card} space-y-3`}>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={w.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-white object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{w.name}</p>
          <p className="text-lg">{formatMoney(w.amountCents)}</p>
          <p className="mt-1 inline-block rounded-full bg-warn-bg px-3 py-1 text-base font-semibold text-warn-ink">
            {w.ready ? "Ready. You can buy it." : `I'll remind you. Ready ${when}.`}
          </p>
        </div>
      </div>
      {w.ready && (
        <Link href={`/shop/${w.productId}`} className={btnPrimary}>
          Look at it again
        </Link>
      )}
    </li>
  );
}

// One buy in the list. A paid buy has a "Get my money back" button, with one question first.
function PurchaseRow({ p, onChange }: { p: PurchaseView; onChange: () => void }) {
  const st = STATUS[p.status];
  const [step, setStep] = useState<"idle" | "asking" | "working">("idle");
  const [message, setMessage] = useState("");

  async function refund() {
    setStep("working");
    try {
      const res = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId: p.id }),
      });
      const out = await res.json();
      setMessage(
        out.kind === "refunded" ? `Done. ${formatMoney(p.amountCents)} is coming back to you.`
        : out.kind === "already_refunded" ? "Already refunded."
        : out.kind === "pending" ? "PayPal is sending your money back. It can take a moment."
        : "I could not refund this. Please try again.",
      );
    } catch {
      setMessage("I could not refund this. Please try again.");
    }
    setStep("idle");
    onChange();
  }

  return (
    <li className={`${card} space-y-3`}>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-white object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{p.name}</p>
          <p className="text-lg">{formatMoney(p.amountCents)}</p>
          <p className={`mt-1 inline-block rounded-full px-3 py-1 text-base font-semibold ${st.cls}`}>
            <span aria-hidden="true">{st.icon} </span>{st.label}
          </p>
        </div>
      </div>
      {message && <p role="status" className="text-lg font-semibold">{message}</p>}
      {p.status === "paid" && step === "idle" && (
        <button type="button" className={btnSecondary} onClick={() => setStep("asking")}>
          Get my money back
        </button>
      )}
      {step === "asking" && (
        <div role="group" aria-label={`Refund ${p.name}?`} className="space-y-2">
          <p className="text-lg font-semibold">Refund {p.name}? You will get {formatMoney(p.amountCents)} back.</p>
          <button type="button" className={btnPrimary} onClick={refund}>Yes, refund it</button>
          <button type="button" className={btnSecondary} onClick={() => setStep("idle")}>No, keep it</button>
        </div>
      )}
      {step === "working" && <p role="status" className="text-lg">Asking PayPal…</p>}
    </li>
  );
}

// Demo only: lets us show a late-night buy at any time of day, and start over.
function DemoTools({ onChange }: { onChange: () => void }) {
  const hour = useDemoHour();
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST" });
    setBusy(false);
    onChange();
  }

  return (
    <details className={card}>
      <summary className="cursor-pointer rounded-lg py-2 text-lg font-semibold">Demo tools</summary>
      <div className="mt-3 space-y-4">
        <label className="block">
          <span className="block text-lg font-semibold">Pretend it is</span>
          <select
            value={hour}
            onChange={(e) => setDemoHour(e.target.value)}
            className="mt-1 min-h-14 w-full rounded-xl border-2 border-line bg-card px-3 text-lg"
          >
            <option value="">The real time</option>
            <option value="23">11:00 PM (late at night)</option>
            <option value="12">12:00 PM (noon)</option>
          </select>
        </label>
        <button type="button" onClick={reset} disabled={busy} className={btnSecondary}>
          {busy ? "Starting over…" : "Start over (clear buys)"}
        </button>
      </div>
    </details>
  );
}
