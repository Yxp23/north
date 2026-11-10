"use client";
// Demo tools: for showing North to someone. A pretend clock for the late-night rule, video-safe mode, replaying first-run setup, the
// Price Watcher, and the attack and assistant demos. They never change how long a rule takes to change.
import { EyeOff, FlaskConical, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { useAppearance } from "@/components/shell/appearance";
import type { StepEvent } from "@/lib/agents/loop";
import { setDemoHour, useDemoHour } from "@/lib/demo-hour";
import { postAgent } from "@/lib/ndjson-client";
import type { WatchRunResult } from "@/lib/watcher/run";
import { writeSetup } from "../welcome/progress";
import { useSummary } from "../summary-parts";

export function DemoTools() {
  const hour = useDemoHour();
  const router = useRouter();
  const a = useAppearance();
  const { data, load } = useSummary();
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{ events: StepEvent[]; result?: WatchRunResult; error?: string; working: boolean } | null>(null);
  const deployed = !!data?.demoDeployment;

  // The Price Watcher: look at the prices of what you are waiting on, now (normally a schedule does this).
  async function checkPrices(pretendDropPercent?: number) {
    setCheck({ events: [], working: true });
    const r = await postAgent<WatchRunResult>("/api/watch/run", { pretendDropPercent }, (events) => setCheck({ events, working: true }));
    setCheck({ events: r.events, result: r.payload ?? undefined, error: r.error ?? r.payload?.error, working: false });
    load();
  }

  async function reset() {
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST" });
    setBusy(false);
    load();
  }

  // Start over (so there are no buys yet), then walk through first-run setup as a new person would.
  async function replaySetup() {
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST" });
    writeSetup({ state: "todo", step: 1 });
    setBusy(false);
    router.push("/welcome");
  }

  return (
    <div className="n-col" style={{ maxWidth: 720 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Settings · Demo tools{deployed ? " (practice version)" : ""}</div>
        <h1>Demo tools.</h1>
        <p>For showing North to someone. {deployed ? "This is a practice version with practice money." : "These are for practice."}</p>
      </div>
      <p role="note" className="n-note n-note-wait">
        <FlaskConical aria-hidden="true" />
        <span>They never change how long a rule takes to change: the pretend time only changes what time of day the late-night rule sees.</span>
      </p>

      <section className={`${card} n-stack`} aria-labelledby="clock-h">
        <h2 id="clock-h">Pretend clock</h2>
        <label className="n-block">
          <span className="n-label">Pretend it is</span>
          <select value={hour} onChange={(e) => setDemoHour(e.target.value)} className="n-field">
            <option value="">The real time</option>
            <option value="23">11:00 PM (late at night)</option>
            <option value="12">12:00 PM (noon)</option>
          </select>
        </label>
      </section>

      <section className={`${card} n-stack`} aria-labelledby="vs-h">
        <h2 id="vs-h">Video-safe mode</h2>
        <p>Keeps real prices and real comparisons. Stores show as Store A, B, C, product names are generic, and photos from live stores are hidden (the demo shop&apos;s own pictures stay), so no brand shows in a recording.</p>
        <label className="n-checkrow">
          <input type="checkbox" checked={a.videoSafe} onChange={(e) => a.setVideoSafe(e.target.checked)} />
          <span><EyeOff aria-hidden="true" size={18} style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />Video-safe mode</span>
        </label>
        <p style={{ color: "var(--n-ink)" }}>It can also be forced on for a whole deployment with <span className="bts-id">VIDEO_SAFE=1</span> when it is built.</p>
      </section>

      <section className={`${card} n-stack`} aria-labelledby="setup-h">
        <h2 id="setup-h">First-run setup</h2>
        <p>Starts over (no buys) and walks through setup like a new person: PayPal, weekly money, a first rule.</p>
        <button type="button" className={btnPrimary} onClick={replaySetup} disabled={busy}><RotateCcw aria-hidden="true" />Replay first-run setup</button>
      </section>

      <section className={`${card} n-stack`} aria-labelledby="more-h">
        <h2 id="more-h">Show the checks</h2>
        <Link href="/try-to-break" className={btnSecondary}>Try to break North</Link>
        <Link href="/assistant-demo" className={btnSecondary}>Try an outside assistant</Link>
        <button type="button" onClick={() => checkPrices()} disabled={check?.working} className={btnSecondary}>Check prices now</button>
        <button type="button" onClick={() => checkPrices(20)} disabled={check?.working} className={btnSecondary}>Check prices now (pretend they dropped 20%)</button>
        {check && (
          <div className="n-stack">
            {!check.working && (
              <p role="status" className="n-t-lg n-strong">
                {check.error ? check.error : check.result && check.result.checked === 0 ? "Nothing to watch yet. Wait on something first." : `Checked ${check.result?.checked ?? 0}. ${check.result?.notices.length ? `${check.result.notices.length} piece${check.result.notices.length === 1 ? "" : "s"} of news on the home screen.` : "No news."}`}
              </p>
            )}
            <ActivityPanel events={check.events} title="What the Price Watcher did" agents={[{ name: "Price Watcher", ai: true, did: "Looked at the prices of what you are waiting on. It can only tell you." }]} />
          </div>
        )}
      </section>

      <button type="button" onClick={reset} disabled={busy} className={btnSecondary}>{busy ? "Starting over…" : "Start over (clear buys)"}</button>
    </div>
  );
}
