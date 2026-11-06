"use client";
// The agent's steps in plain words, so the user can see what the helper is doing.
// The words are written by us (never the AI's own text). Shown live while the agent works.
import { useState } from "react";
import type { StepEvent } from "@/lib/agents/loop";
import { card } from "./classes";

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
 */
export function ActivityPanel({ events, title = "What I am doing" }: { events: StepEvent[]; title?: string }) {
  const lines = collapseSteps(events);
  const [showDetails, setShowDetails] = useState(false);
  const hasDetails = lines.some((l) => l.detail);
  return (
    <section aria-label={title} className={`${card} space-y-2`}>
      <h2 className="text-lg font-semibold text-muted">{title}</h2>
      <ol aria-live="polite" className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="text-lg">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="w-6 text-center">{l.warn ? "⚠" : l.done ? "✓" : "…"}</span>
              <span className={l.warn ? "font-semibold text-warn-ink" : l.done ? "" : "font-semibold"}>{l.label}</span>
            </div>
            {showDetails && l.detail && (
              <pre className="mt-1 ml-9 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-2 text-sm text-slate-800">{l.detail}</pre>
            )}
          </li>
        ))}
      </ol>
      {hasDetails && (
        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((v) => !v)}
          className="min-h-11 rounded-lg px-2 text-base font-semibold text-accent underline"
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      )}
    </section>
  );
}
