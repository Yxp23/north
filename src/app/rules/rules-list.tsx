"use client";
// "My rules": every rule in plain words, with its strength.
import Link from "next/link";
import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import type { Strength } from "@/lib/guardian";
import type { RuleLine } from "@/lib/rules/summary";

const STRENGTH: Record<Strength, { label: string; cls: string; icon: string }> = {
  gentle: { label: "Gentle", cls: "bg-good-bg text-good-ink", icon: "🔔" },
  firm: { label: "Firm", cls: "bg-warn-bg text-warn-ink", icon: "⏳" },
  locked: { label: "Locked", cls: "bg-bad-bg text-bad-ink", icon: "🔒" },
};

export const whenLabel = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" });

export function RulesList() {
  const [data, setData] = useState<{ rules: RuleLine[]; always: string[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setData(j))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      // Next keeps a page you left. Clear it, so coming back never shows a rule from before a change.
      setData(null);
    };
  }, []);

  if (error) return <p role="status" className="text-xl">I can&apos;t load your rules right now. Please try again.</p>;
  if (!data) return <p role="status" className="text-xl">Loading your rules…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">My rules</h1>

      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="text-2xl font-bold">Rules I follow for you</h2>
        {data.rules.length === 0 && <p className="text-lg">You have no wait rules yet.</p>}
        <ul className="space-y-3">
          {data.rules.map((r) => {
            const s = r.strength ? STRENGTH[r.strength] : null;
            return (
              <li key={r.kind} className={`${card} space-y-2`}>
                {s && (
                  <p className={`inline-block rounded-full px-3 py-1 text-base font-semibold ${s.cls}`}>
                    <span aria-hidden="true">{s.icon} </span>{s.label}
                  </p>
                )}
                <p className="text-xl">{r.text}</p>
                {r.pending && (
                  <p className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">
                    A change is waiting. It starts {whenLabel(r.pending.startsAt)}. Until then, the rule above stays.
                    <span className="mt-1 block font-semibold">New: {r.pending.text}</span>
                  </p>
                )}
                <Link href={`/rules/change/${r.kind}`} className={btnSecondary}>Change or remove this rule</Link>
              </li>
            );
          })}
        </ul>
        <Link href="/rules/new" className={btnPrimary}>Add a rule in my own words</Link>
      </section>

      <section aria-labelledby="always-h" className="space-y-3">
        <h2 id="always-h" className="text-2xl font-bold">Rules I always keep</h2>
        <ul className="space-y-3">
          {data.always.map((t) => (
            <li key={t} className={`${card} text-lg`}>{t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
