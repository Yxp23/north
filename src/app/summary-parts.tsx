"use client";
// The pieces of "this week's money" that more than one screen shows: the data hook, the assistant's one-tap card, price news, the
// waiting list (with Remove and Undo), the list of buys (with refunds and PayPal's receipt numbers) and the demo tools.
import { Bell, CircleCheck, CircleX, Clock, Hourglass, Undo2, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { SpeakButton } from "@/components/shell/speak";
import type { StepEvent } from "@/lib/agents/loop";
import { setDemoHour, useDemoHour } from "@/lib/demo-hour";
import { formatMoney } from "@/lib/format";
import type { AssistantAskView, HomeSummary, PriceNotice, PurchaseStatus, PurchaseView, WaitingView } from "@/lib/ledger/types";
import { postAgent } from "@/lib/ndjson-client";
import type { WatchRunResult } from "@/lib/watcher/run";

export type Summary = HomeSummary & { paypalSaved: boolean; demoMode: boolean; demoDeployment?: boolean };

/** The money summary, asked again every few seconds so a payment or refund that PayPal reports by webhook shows up on its own. */
export function useSummary() {
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
  return { data, error, load };
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });

const STATUS: Record<PurchaseStatus, { label: string; cls: string; Icon: typeof CircleCheck }> = {
  paid: { label: "Paid with PayPal", cls: "n-chip-good", Icon: CircleCheck },
  pending: { label: "Waiting for PayPal", cls: "n-chip-wait", Icon: Hourglass },
  refunded: { label: "Money back", cls: "n-chip-wait", Icon: Undo2 },
  failed: { label: "Did not go through", cls: "n-chip-stop", Icon: CircleX },
};

// A one-tap card: "Your assistant wants to buy Warm Socks, $11. Yes / No". Yes still goes through the Money Guardian.
export function AskRow({ a, onChange, onAnswered }: { a: AssistantAskView; onChange: () => void; onAnswered: (message: string) => void }) {
  const [working, setWorking] = useState(false);

  async function answer(yes: boolean) {
    setWorking(true);
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "answer", id: a.id, answer: yes ? "yes" : "no" }) });
      const out = await res.json();
      onAnswered(out.message ?? "That did not work. Nothing was bought. Try again.");
    } catch {
      onAnswered("That did not work. Nothing was bought. Try again.");
    }
    setWorking(false);
    onChange();
  }
  const sentence = `${a.agentName} wants to buy ${a.name}, ${formatMoney(a.amountCents)}.`;

  return (
    <li className={`${card} n-card-accent n-stack`}>
      <div className="n-rowitem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.imageUrl} alt="" className="n-thumb" />
        <div>
          <p className="n-chip n-chip-quiet" style={{ marginBottom: 6 }}><Bell aria-hidden="true" />Your assistant is asking</p>
          <p className="text-lg font-semibold">{sentence}</p>
          {a.reason && <p className="mt-1">It says: &ldquo;{a.reason}&rdquo;</p>}
        </div>
      </div>
      {a.needsOverride && <p className="n-note n-note-wait"><Clock aria-hidden="true" /><span>{a.note} Only you can say Buy now.</span></p>}
      <SpeakButton text={`${sentence} ${a.needsOverride ? a.note : ""}`} />
      <button type="button" className={btnPrimary} onClick={() => answer(true)} disabled={working}>{a.needsOverride ? "Yes, buy now" : "Yes, buy it"}</button>
      <button type="button" className={btnSecondary} onClick={() => answer(false)} disabled={working}>No</button>
    </li>
  );
}

// One piece of price news. It only tells you: "Look at it" opens the product, and a buy still goes through the Money Guardian.
export function NoticeRow({ n, onChange }: { n: PriceNotice; onChange: () => void }) {
  async function dismiss() {
    await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss", id: n.id }) }).catch(() => undefined);
    onChange();
  }
  return (
    <li className={`${card} n-stack`}>
      <div className="n-rowitem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={n.imageUrl} alt="" className="n-thumb" />
        <p className="text-lg font-semibold">{n.message}</p>
      </div>
      {n.kind !== "sold_out" && <Link href={`/shop/${n.productId}`} className={btnPrimary}>Look at it</Link>}
      <button type="button" className={btnSecondary} onClick={dismiss}>Not now</button>
    </li>
  );
}

// One saved buy. Waiting until the wait is over; then it can be bought like any other buy. "Take it off my list" has an Undo that
// brings back the very same saved item, with its own timer unchanged.
export function WaitingRow({ w, onRemove }: { w: WaitingView; onRemove: (w: WaitingView) => void }) {
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  async function remove() {
    setWorking(true);
    setFailed(false);
    try {
      const res = await fetch("/api/waiting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", id: w.id }) });
      if (!res.ok) throw new Error();
      onRemove(w);
    } catch {
      setFailed(true);
    }
    setWorking(false);
  }
  return (
    <li className={`${card} n-stack`}>
      <div className="n-rowitem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={w.imageUrl} alt="" className="n-thumb" />
        <div>
          <p className="text-lg font-semibold">{w.name}</p>
          <p className="text-lg">{formatMoney(w.amountCents)}</p>
          <p className={`n-chip ${w.ready ? "n-chip-good" : "n-chip-wait"}`} style={{ marginTop: 6 }}>
            {w.ready ? <CircleCheck aria-hidden="true" /> : <Clock aria-hidden="true" />}
            {w.ready ? "Ready. You can buy it." : `I'll remind you. Ready ${when(w.remindAt)}.`}
          </p>
        </div>
      </div>
      {w.ready && <Link href={`/shop/${w.productId}`} className={btnPrimary}>Look at it again</Link>}
      <button type="button" className={btnSecondary} onClick={remove} disabled={working}>Take it off my list</button>
      {failed && <p role="alert" className="n-note n-note-stop">That did not work. Your list is the same. Try again.</p>}
    </li>
  );
}

export function RemovedRow({ w, onUndone }: { w: WaitingView; onUndone: (w: WaitingView) => void }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  async function undo() {
    setWorking(true);
    try {
      const res = await fetch("/api/waiting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo", id: w.id }) });
      if (!res.ok) throw new Error();
      onUndone(w);
    } catch {
      setMessage("I could not put it back. It may already be on your list again.");
    }
    setWorking(false);
  }
  return (
    <li className="n-note n-note-quiet" style={{ flexWrap: "wrap" }}>
      <Undo2 aria-hidden="true" />
      <div className="n-stack" style={{ gap: 10 }}>
        <p>{w.name} is off your list.</p>
        <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={undo} disabled={working}>Undo</button>
        {message && <p role="alert">{message}</p>}
      </div>
    </li>
  );
}

// One buy in the list. A paid buy has a "Get my money back" button, with one question first.
export function PurchaseRow({ p, onChange }: { p: PurchaseView; onChange: () => void }) {
  const st = STATUS[p.status];
  const [step, setStep] = useState<"idle" | "asking" | "working">("idle");
  const [message, setMessage] = useState("");

  async function refund() {
    setStep("working");
    try {
      const res = await fetch("/api/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchaseId: p.id }) });
      const out = await res.json();
      setMessage(
        out.kind === "refunded" ? `Done. ${formatMoney(p.amountCents)} is coming back to you.`
        : out.kind === "already_refunded" ? "Already refunded."
        : out.kind === "pending" ? "PayPal is sending your money back. It can take a moment."
        : "That did not work. Nothing was refunded. Try again.",
      );
    } catch {
      setMessage("That did not work. Nothing was refunded. Try again.");
    }
    setStep("idle");
    onChange();
  }

  return (
    <li className={`${card} n-stack`}>
      <div className="n-rowitem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl} alt="" className="n-thumb" />
        <div>
          <p className="text-lg font-semibold">{p.name}</p>
          <p className="text-lg">{formatMoney(p.amountCents)}</p>
          <p className={`n-chip ${st.cls}`} style={{ marginTop: 6 }}><st.Icon aria-hidden="true" />{st.label}</p>
        </div>
      </div>
      {(p.paypalOrderId || p.paypalCaptureId) && (
        <details className="gd-how" style={{ marginTop: 0 }}>
          <summary><Wallet aria-hidden="true" size={18} />PayPal receipt</summary>
          <dl className="ng-review" style={{ margin: "8px 0 0" }}>
            <div className="ng-review-row"><dt>Status</dt><dd style={{ margin: 0 }}><strong>{p.status === "paid" ? "Completed" : p.status === "refunded" ? "Refunded" : p.status === "pending" ? "Waiting" : "Did not go through"}</strong></dd></div>
            {p.paypalOrderId && <div className="ng-review-row"><dt>Order</dt><dd className="bts-id" style={{ margin: 0 }}>{p.paypalOrderId}</dd></div>}
            {p.paypalCaptureId && <div className="ng-review-row"><dt>Capture</dt><dd className="bts-id" style={{ margin: 0 }}>{p.paypalCaptureId}</dd></div>}
          </dl>
        </details>
      )}
      {message && <p role="status" className="text-lg font-semibold">{message}</p>}
      {p.status === "paid" && step === "idle" && (
        <button type="button" className={btnSecondary} onClick={() => setStep("asking")}>Get my money back</button>
      )}
      {step === "asking" && (
        <div role="group" aria-label={`Refund ${p.name}?`} className="n-stack">
          <p className="text-lg font-semibold">Refund {p.name}? You will get {formatMoney(p.amountCents)} back.</p>
          <button type="button" className={btnPrimary} onClick={refund}>Yes, refund it</button>
          <button type="button" className={btnSecondary} onClick={() => setStep("idle")}>No, keep it</button>
        </div>
      )}
      {step === "working" && <p role="status" className="text-lg">Asking PayPal. One moment.</p>}
    </li>
  );
}

// Demo only: lets us show a late-night buy at any time of day, and start over.
export function DemoTools({ onChange, deployed }: { onChange: () => void; deployed: boolean }) {
  const hour = useDemoHour();
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{ events: StepEvent[]; result?: WatchRunResult; error?: string; working: boolean } | null>(null);

  // The Price Watcher: look at the prices of what you are waiting on, now (normally a schedule does this).
  async function checkPrices(pretendDropPercent?: number) {
    setCheck({ events: [], working: true });
    const r = await postAgent<WatchRunResult>("/api/watch/run", { pretendDropPercent }, (events) => setCheck({ events, working: true }));
    setCheck({ events: r.events, result: r.payload ?? undefined, error: r.error ?? r.payload?.error, working: false });
    onChange();
  }

  async function reset() {
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST" });
    setBusy(false);
    onChange();
  }

  return (
    <details className={card}>
      <summary className="cursor-pointer rounded-lg py-2 text-lg font-semibold">Demo tools{deployed ? " (practice version)" : ""}</summary>
      <div className="mt-3 n-stack">
        <p role="note" className="n-note n-note-wait">
          <span>
            {deployed ? "This is a practice version of North with practice money. " : "These tools are for practice. "}
            They never change how long a rule takes to change: the pretend time only changes what time of day the late-night rule sees.
          </span>
        </p>
        <label className="block">
          <span className="n-label">Pretend it is</span>
          <select value={hour} onChange={(e) => setDemoHour(e.target.value)} className="n-field">
            <option value="">The real time</option>
            <option value="23">11:00 PM (late at night)</option>
            <option value="12">12:00 PM (noon)</option>
          </select>
        </label>
        <Link href="/try-to-break" className={btnSecondary}>Try to break North</Link>
        <Link href="/assistant-demo" className={btnSecondary}>Try an outside assistant</Link>
        <button type="button" onClick={() => checkPrices()} disabled={check?.working} className={btnSecondary}>Check prices now</button>
        <button type="button" onClick={() => checkPrices(20)} disabled={check?.working} className={btnSecondary}>Check prices now (pretend they dropped 20%)</button>
        {check && (
          <div className="n-stack">
            {!check.working && (
              <p role="status" className="text-lg font-semibold">
                {check.error ? check.error : check.result && check.result.checked === 0 ? "Nothing to watch yet. Wait on something first." : `Checked ${check.result?.checked ?? 0}. ${check.result?.notices.length ? `${check.result.notices.length} piece${check.result.notices.length === 1 ? "" : "s"} of news on the home screen.` : "No news."}`}
              </p>
            )}
            <ActivityPanel events={check.events} title="What the Price Watcher did" agents={[{ name: "Price Watcher", ai: true, did: "Looked at the prices of what you are waiting on. It can only tell you." }]} />
          </div>
        )}
        <button type="button" onClick={reset} disabled={busy} className={btnSecondary}>{busy ? "Starting over…" : "Start over (clear buys)"}</button>
      </div>
    </details>
  );
}
