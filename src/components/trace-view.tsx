"use client";
// The real story of a decision, shown two ways: in the "Behind the scenes" side panel and inline in a decision ("How North decided").
// Who ran, each Guardian check (passed, stopped here, not reached), whether a signed approval was made, whether PayPal was called.
// Everything comes from the real outcome and the real streamed steps: see lib/ui/guardian-trace.ts.
import { Bot, CircleCheck, CircleDashed, CircleMinus, Cpu, Hand, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { collapseSteps } from "@/components/activity-panel";
import type { StepEvent } from "@/lib/agents/loop";
import { guardianChecks, type CheckoutTrace, type CheckState } from "@/lib/ui/guardian-trace";
import { TracePublisher, type TraceAgent } from "./shell/trace";

const STATE: Record<CheckState, { word: string; cls: string; Icon: typeof CircleCheck }> = {
  passed: { word: "Passed", cls: "n-chip-good", Icon: CircleCheck },
  no_rule: { word: "No rule applied", cls: "n-chip-quiet", Icon: CircleMinus },
  decided: { word: "Decided here", cls: "n-chip-wait", Icon: Hand },
  stopped: { word: "Stopped here", cls: "n-chip-stop", Icon: Hand },
  not_reached: { word: "Not reached", cls: "n-chip-quiet", Icon: CircleDashed },
};

export type TraceData = {
  agents: TraceAgent[];
  checkout?: CheckoutTrace;
  guardian?: { decision: string; code: string; reason: string };
  events?: StepEvent[];
};

export function TraceView({ data, withSteps = false }: { data: TraceData; withSteps?: boolean }) {
  const g = data.checkout?.guardian ?? (data.guardian ? { asked: true, ...data.guardian } : null);
  const checks = data.checkout?.guardian.checks.length ? data.checkout.guardian.checks : data.guardian ? guardianChecks(data.guardian.code, data.guardian.decision) : [];
  const lines = withSteps && data.events ? collapseSteps(data.events) : [];
  return (
    <div className="n-stack" style={{ gap: 8 }}>
      <h3>Who ran</h3>
      <ul className="bts-list">
        {data.agents.map((a) => (
          <li key={a.name} className="bts-row">
            {a.ai ? <Bot aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            <span><b>{a.name}</b> · {a.ai ? "AI helper" : "plain code, no AI"}<br />{a.did}</span>
          </li>
        ))}
        {data.agents.length === 0 && <li className="bts-row"><Cpu aria-hidden="true" /><span>No AI helper ran.</span></li>}
      </ul>
      {data.checkout && <p>{data.checkout.aiAgents}</p>}

      {g && g.asked !== false && (
        <>
          <h3>Money Guardian checks</h3>
          <p className="bts-muted">The Guardian is plain code. It stops at the first check that applies, so the checks before it passed and the ones after it were not reached.</p>
          <ol className="bts-list">
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
          <p><b>Answer:</b> {g.decision} <span className="bts-id">({g.code})</span>.<br />{g.reason}</p>
        </>
      )}
      {data.checkout && !data.checkout.guardian.asked && <><h3>Money Guardian</h3><p>The Guardian was not asked this time.</p></>}

      {data.checkout && (
        <>
          <h3>Signed approval</h3>
          <div className="bts-row">
            {data.checkout.approval.issued ? <CircleCheck aria-hidden="true" /> : <Hand aria-hidden="true" />}
            <span><b>{data.checkout.approval.issued ? "Issued" : "Not issued"}</b><br />{data.checkout.approval.note}</span>
          </div>
          <h3>PayPal</h3>
          <div className="bts-row">
            <Wallet aria-hidden="true" />
            <span>
              <b>{data.checkout.paypal.called ? "Called" : "Not called"}</b><br />{data.checkout.paypal.note}
              {data.checkout.paypal.orderId && <><br />Order <span className="bts-id">{data.checkout.paypal.orderId}</span></>}
              {data.checkout.paypal.captureId && <><br />Capture <span className="bts-id">{data.checkout.paypal.captureId}</span></>}
            </span>
          </div>
          {data.checkout.guardian.asked && <p className="bts-muted">The decision was also written to your audit log.</p>}
        </>
      )}

      {lines.length > 0 && (
        <>
          <h3>Steps, in the order they happened</h3>
          <ol className="bts-list">
            {lines.map((l, i) => (
              <li key={i} className="bts-row">
                {l.warn ? <TriangleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                <span>{l.label}{l.detail && <><br /><span className="bts-muted" style={{ overflowWrap: "anywhere" }}>{l.detail}</span></>}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/** "How North decided": the same story, folded inside a decision. Real data only. */
export function HowDecided({ data, title = "A decision", defaultOpen = false }: { data: TraceData; title?: string; defaultOpen?: boolean }) {
  return (
    <>
      <Disclosure summary="How North decided" defaultOpen={defaultOpen} className="gd-how">
        <TraceView data={data} withSteps />
      </Disclosure>
      <TracePublisher title={title} agents={data.agents} events={data.events ?? []} checkout={data.checkout} guardian={data.guardian} />
    </>
  );
}
