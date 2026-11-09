"use client";
// "Behind the scenes" (laptop): the real activity for the current action. Which helpers ran, each Guardian check and its result,
// whether a signed approval was made, and whether PayPal was called, with PayPal's own order and capture numbers. All of it is read
// from the steps and outcomes the server already streams to the screen.
import { Bot, CircleCheck, CircleDashed, CircleMinus, Cpu, Hand, ShieldCheck, TriangleAlert, Wallet, X } from "lucide-react";
import { useRef } from "react";
import { guardianChecks, type CheckState } from "@/lib/ui/guardian-trace";
import { collapseSteps } from "@/components/activity-panel";
import { useAppearance } from "./appearance";
import { useTrace } from "./trace";

const STATE: Record<CheckState, { word: string; cls: string; Icon: typeof CircleCheck }> = {
  passed: { word: "Passed", cls: "n-chip-good", Icon: CircleCheck },
  no_rule: { word: "No rule applied", cls: "n-chip-quiet", Icon: CircleMinus },
  decided: { word: "Decided here", cls: "n-chip-wait", Icon: Hand },
  stopped: { word: "Stopped here", cls: "n-chip-stop", Icon: Hand },
  not_reached: { word: "Not reached", cls: "n-chip-quiet", Icon: CircleDashed },
};

export function BehindTheScenes() {
  const { behind, setBehind } = useAppearance();
  const trace = useTrace();
  const closeRef = useRef<HTMLButtonElement>(null);
  if (!behind) return null;

  const checks = trace?.checkout?.guardian.checks.length
    ? trace.checkout.guardian.checks
    : trace?.guardian
      ? guardianChecks(trace.guardian.code, trace.guardian.decision)
      : [];
  const g = trace?.checkout?.guardian ?? (trace?.guardian ? { asked: true, ...trace.guardian } : null);
  const lines = trace ? collapseSteps(trace.events) : [];

  return (
    <aside className="ng-bts" aria-label="Behind the scenes">
      <h2>Behind the scenes</h2>
      <button ref={closeRef} type="button" className="ng-appearance-close" aria-label="Close Behind the scenes" onClick={() => setBehind(false)}>
        <X aria-hidden="true" />
      </button>
      <p className="bts-muted">The real steps for what you just did. Nothing here is a mock-up.</p>

      {!trace ? (
        <div className="n-note n-note-quiet">
          <Cpu aria-hidden="true" />
          <p>Nothing yet. Buy something, check a deal or ask North, and the real steps show up here.</p>
        </div>
      ) : (
        <>
          <p><b>{trace.title}</b></p>

          <h3>Who ran</h3>
          <ul>
            {trace.agents.map((a) => (
              <li key={a.name} className="bts-row">
                {a.ai ? <Bot aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                <span><b>{a.name}</b> · {a.ai ? "AI helper" : "plain code, no AI"}<br />{a.did}</span>
              </li>
            ))}
            {trace.agents.length === 0 && <li className="bts-row"><Cpu aria-hidden="true" /><span>No AI helper ran.</span></li>}
          </ul>
          {trace.checkout && <p style={{ marginTop: 10 }}>{trace.checkout.aiAgents}</p>}

          {g && g.asked !== false && (
            <>
              <h3>Money Guardian checks</h3>
              <p className="bts-muted">The Guardian is plain code. It stops at the first check that applies, so the checks before it passed and the ones after it were not reached.</p>
              <ol>
                {checks.map((c) => {
                  const s = STATE[c.state];
                  return (
                    <li key={c.label} className="bts-row">
                      <s.Icon aria-hidden="true" />
                      <span>{c.label}<br /><span className={`n-chip ${s.cls}`}>{s.word}</span></span>
                    </li>
                  );
                })}
              </ol>
              <p style={{ marginTop: 10 }}><b>Answer:</b> {g.decision} <span className="bts-id">({g.code})</span>.<br />{g.reason}</p>
            </>
          )}
          {trace.checkout && !trace.checkout.guardian.asked && <><h3>Money Guardian</h3><p>The Guardian was not asked this time.</p></>}

          {trace.checkout && (
            <>
              <h3>Signed approval</h3>
              <div className="bts-row">
                {trace.checkout.approval.issued ? <CircleCheck aria-hidden="true" /> : <Hand aria-hidden="true" />}
                <span><b>{trace.checkout.approval.issued ? "Issued" : "Not issued"}</b><br />{trace.checkout.approval.note}</span>
              </div>
              <h3>PayPal</h3>
              <div className="bts-row">
                <Wallet aria-hidden="true" />
                <span>
                  <b>{trace.checkout.paypal.called ? "Called" : "Not called"}</b><br />{trace.checkout.paypal.note}
                  {trace.checkout.paypal.orderId && <><br />Order <span className="bts-id">{trace.checkout.paypal.orderId}</span></>}
                  {trace.checkout.paypal.captureId && <><br />Capture <span className="bts-id">{trace.checkout.paypal.captureId}</span></>}
                </span>
              </div>
              {trace.checkout.guardian.asked && <p className="bts-muted" style={{ marginTop: 10 }}>The decision was also written to your audit log.</p>}
            </>
          )}

          <h3>Steps, in the order they happened</h3>
          <ol>
            {lines.map((l, i) => (
              <li key={i} className="bts-row">
                {l.warn ? <TriangleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                <span>{l.label}{l.detail && <><br /><span className="bts-muted" style={{ overflowWrap: "anywhere" }}>{l.detail}</span></>}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
