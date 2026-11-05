"use client";
// The agent's steps in plain words, so the user can see what the helper is doing.
// The words are written by us (never the AI's own text). Shown live while the agent works.
import type { StepEvent } from "@/lib/agents/loop";
import { card } from "./classes";

/**
 * One line per step. A step's "working" and "done" events share a line. A step is also finished once the
 * next step starts (the first line has no "done" event of its own), and everything is finished at the end.
 */
export function collapseSteps(events: StepEvent[]): { label: string; done: boolean }[] {
  const lines: { label: string; done: boolean }[] = [];
  for (const e of events) {
    const last = lines[lines.length - 1];
    if (e.state === "done" && last && last.label === e.label) {
      last.done = true;
      continue;
    }
    for (const l of lines) l.done = true; // whatever came before is finished
    lines.push({ label: e.label, done: e.state === "done" });
  }
  return lines;
}

export function ActivityPanel({ events, title = "What I am doing" }: { events: StepEvent[]; title?: string }) {
  const lines = collapseSteps(events);
  return (
    <section aria-label={title} className={`${card} space-y-2`}>
      <h2 className="text-lg font-semibold text-muted">{title}</h2>
      <ol aria-live="polite" className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-3 text-lg">
            <span aria-hidden="true" className="w-6 text-center">{l.done ? "✓" : "…"}</span>
            <span className={l.done ? "" : "font-semibold"}>{l.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
