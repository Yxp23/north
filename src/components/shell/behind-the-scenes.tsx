"use client";
// "Behind the scenes" (laptop): the real activity for the current action, as a side panel. The same story is also folded inside each
// decision as "How North decided". All of it is read from the steps and outcomes the server already streams to the screen.
import { Cpu, X } from "lucide-react";
import { TraceView } from "@/components/trace-view";
import { useAppearance } from "./appearance";
import { useTrace } from "./trace";

export function BehindTheScenes() {
  const { behind, setBehind } = useAppearance();
  const trace = useTrace();
  if (!behind) return null;
  return (
    <aside className="ng-bts" aria-label="Behind the scenes">
      <h2>Behind the scenes</h2>
      <button type="button" className="ng-appearance-close" aria-label="Close Behind the scenes" onClick={() => setBehind(false)}>
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
          <TraceView data={{ agents: trace.agents, checkout: trace.checkout, guardian: trace.guardian, events: trace.events }} withSteps />
        </>
      )}
    </aside>
  );
}
