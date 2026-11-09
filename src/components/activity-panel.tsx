"use client";
// The agent's steps in plain words, so the user can see what the helper is doing.
// The words are written by us (never the AI's own text). Shown live while the agent works.
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { StepEvent } from "@/lib/agents/loop";
import type { CheckoutTrace } from "@/lib/ui/guardian-trace";
import { card } from "./classes";
import { usePublishTrace, type TraceAgent } from "./shell/trace";

type Line = { label: string; done: boolean; detail?: string; warn?: boolean };

/**
 * One line per step. A step's "working" and "done" events share a line. A step is also finished once the
 * next step starts (the first line has no "done" event of its own), and everything is finished at the end.
 */
export function collapseSteps(events: StepEvent[]): Line[] {
  const lines: Line[] = [];
  for (const e of events) {
    const last = lines[lines.length - 1];
    if (e.state === "done" && last && last.label === e.label) {
      last.done = true;
      if (e.detail) last.detail = e.detail;
      continue;
    }
    for (const l of lines) l.done = true; // whatever came before is finished
    const line: Line = { label: e.label, done: e.state === "done" };
    if (e.detail) line.detail = e.detail;
    if (e.warn) line.warn = true;
    lines.push(line);
  }
  return lines;
}

/**
 * The steps in plain words. "Show details" (for judges and curious people) adds each tool call under its line.
 * Details are shown as plain text, never as markup, because they can hold text from a listing.
 * The same real steps are also given to "Behind the scenes" (laptop), with who ran and, for a buy, the Guardian's checks.
 */
export function ActivityPanel({
  events, title = "What I am doing", agents, checkout, guardian,
}: {
  events: StepEvent[];
  title?: string;
  /** Which helpers really ran, for Behind the scenes. */
  agents?: TraceAgent[];
  checkout?: CheckoutTrace;
  guardian?: { decision: string; code: string; reason: string };
}) {
  const lines = collapseSteps(events);
  const [showDetails, setShowDetails] = useState(false);
  const hasDetails = lines.some((l) => l.detail);
  const publish = usePublishTrace();
  useEffect(() => {
    if (events.length > 0) publish?.({ title, agents: agents ?? [], events, checkout, guardian });
  }, [publish, title, agents, events, checkout, guardian]);
  return (
    <section aria-label={title} className={`${card} n-stack`} style={{ gap: 10 }}>
      <h2 className="text-muted" style={{ fontSize: 18 }}>{title}</h2>
      <ol aria-live="polite" className="n-stack" style={{ gap: 10 }}>
        {lines.map((l, i) => (
          <li key={i} className="text-base">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 shrink-0">
                {l.warn ? <TriangleAlert size={20} /> : l.done ? <CircleCheck size={20} /> : <Clock size={20} />}
              </span>
              <span className={l.warn ? "font-semibold text-warn-ink" : l.done ? "" : "font-semibold"}>
                {l.warn && <span className="ng-vh">Warning: </span>}{l.label}{!l.done && <span className="ng-vh"> (working)</span>}
              </span>
            </div>
            {showDetails && l.detail && (
              <pre className="mt-1 ml-8 overflow-x-auto whitespace-pre-wrap break-words rounded-lg p-2 text-base" style={{ background: "var(--n-quiet)", color: "var(--n-ink)", fontFamily: "inherit" }}>{l.detail}</pre>
            )}
          </li>
        ))}
      </ol>
      {hasDetails && (
        <button type="button" aria-expanded={showDetails} onClick={() => setShowDetails((v) => !v)} className="n-link" style={{ justifySelf: "start" }}>
          {showDetails ? "Hide details" : "Show details"}
        </button>
      )}
    </section>
  );
}
