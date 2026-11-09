"use client";
// What the last action really did, for the "Behind the scenes" panel. Screens publish the real steps they already stream (the
// activity panel's events) and the real outcome of a buy. Nothing here is made up, and nothing is published unless something happened.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { StepEvent } from "@/lib/agents/loop";
import type { CheckoutTrace } from "@/lib/ui/guardian-trace";

export type TraceAgent = { name: string; ai: boolean; did: string };
export type Trace = {
  title: string;
  at: string;
  agents: TraceAgent[];
  events: StepEvent[];
  checkout?: CheckoutTrace;
  /** An assistant's request: the Guardian's own answer, for the checks list. */
  guardian?: { decision: string; code: string; reason: string };
};

const PublishCtx = createContext<((t: Omit<Trace, "at">) => void) | null>(null);
const TraceCtx = createContext<Trace | null>(null);

export function TraceProvider({ children }: { children: ReactNode }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const publish = useCallback((t: Omit<Trace, "at">) => {
    setTrace((old) => (old && old.title === t.title && JSON.stringify(old.events) === JSON.stringify(t.events) && JSON.stringify(old.checkout) === JSON.stringify(t.checkout) ? old : { ...t, at: new Date().toISOString() }));
  }, []);
  const stable = useMemo(() => publish, [publish]);
  return (
    <PublishCtx.Provider value={stable}>
      <TraceCtx.Provider value={trace}>{children}</TraceCtx.Provider>
    </PublishCtx.Provider>
  );
}

export const usePublishTrace = () => useContext(PublishCtx);
export const useTrace = () => useContext(TraceCtx);

/** Gives a decision's real story to the Behind the scenes panel. Draws nothing. */
export function TracePublisher({ title, agents, events, checkout, guardian }: Omit<Trace, "at">) {
  const publish = usePublishTrace();
  useEffect(() => {
    if (events.length > 0 || checkout || guardian) publish?.({ title, agents, events, checkout, guardian });
  }, [publish, title, agents, events, checkout, guardian]);
  return null;
}
