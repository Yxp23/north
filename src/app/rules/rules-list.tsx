"use client";
// "My rules": every rule in plain words, with its strength. Each rule can be read aloud. A change that has not started yet can be
// undone: that only brings back the rule you have now, so it can never make a rule weaker.
import { Bell, Clock, Lock, Undo2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { whenPlain } from "./strength-copy";
import { SpeakButton } from "@/components/shell/speak";
import { Empty, ErrorNote, Loading } from "@/components/states";
import type { Strength } from "@/lib/guardian";
import type { RuleLine } from "@/lib/rules/summary";

const STRENGTH: Record<Strength, { label: string; cls: string; Icon: LucideIcon; what: string }> = {
  gentle: { label: "Gentle", cls: "n-chip-good", Icon: Bell, what: "I ask. You can buy now." },
  firm: { label: "Firm", cls: "n-chip-wait", Icon: Clock, what: "I save it for later. No Buy now." },
  locked: { label: "Locked", cls: "n-chip-stop", Icon: Lock, what: "Never, while this rule is on." },
};

export function RulesList() {
  const [data, setData] = useState<{ rules: RuleLine[]; always: string[] } | null>(null);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/rules", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setData(await r.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => {
      clearTimeout(t);
      // Next keeps a page you left. Clear it, so coming back never shows a rule from before a change.
      setData(null);
    };
  }, [load]);

  async function undo(kind: string) {
    setMessage("");
    try {
      const r = await fetch("/api/rules/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", kind }) });
      const j = await r.json();
      setMessage(r.ok ? j.message : "That did not work. Your rule is the same. Try again.");
    } catch {
      setMessage("That did not work. Your rule is the same. Try again.");
    }
    load();
  }

  const page = (body: React.ReactNode) => (
    <div className="n-col" style={{ maxWidth: 720 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Money · My rules</div>
        <h1>Your rules,<br />your call.</h1>
        <p>You set them. You can change or remove any of them.</p>
      </div>
      {body}
    </div>
  );
  if (error) return page(<ErrorNote what="your rules" onRetry={load} />);
  if (!data) return page(<Loading what="your rules" />);

  return page(
    <>
      {message && <p role="status" className="n-note n-note-good">{message}</p>}
      <section aria-labelledby="mine-h" className="n-stack">
        <h2 id="mine-h">Rules I follow for you</h2>
        {data.rules.length === 0 && <Empty>You have no wait rules yet. Add one in your own words.</Empty>}
        <ul className="n-stack">
          {data.rules.map((r) => {
            const s = r.strength ? STRENGTH[r.strength] : null;
            return (
              <li key={r.kind} className={`${card} n-stack`}>
                {s && (
                  <p className={`n-chip ${s.cls}`} style={{ justifySelf: "start" }}><s.Icon aria-hidden="true" />{s.label}<span className="ng-vh">: {s.what}</span></p>
                )}
                <p className="n-t-xl">{r.text}</p>
                {s && <p style={{ color: "var(--n-muted)" }}>{s.what}</p>}
                {r.pending && (
                  <div className="n-note n-note-wait">
                    <Clock aria-hidden="true" />
                    <div className="n-stack" style={{ gap: 8 }}>
                      <p>A change is waiting. It starts {whenPlain(r.pending.startsAt)}. Until then, the rule above stays.</p>
                      <p><strong>New: {r.pending.text}</strong></p>
                      <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={() => undo(r.kind)}><Undo2 aria-hidden="true" />Undo this change</button>
                    </div>
                  </div>
                )}
                <SpeakButton text={`${s ? `${s.label} rule. ` : ""}${r.text}${s ? ` ${s.what}` : ""}`} label="Hear this rule" />
                <Link href={`/rules/change/${r.kind}`} className={btnSecondary}>Change or remove this rule</Link>
              </li>
            );
          })}
        </ul>
        <Link href="/rules/new" className={btnPrimary}>Add a rule in my own words</Link>
      </section>

      <section aria-labelledby="always-h" className="n-stack">
        <h2 id="always-h">Rules I always keep</h2>
        <ul className="n-stack">
          {data.always.map((t) => (
            <li key={t} className={`${card} n-stack`}>
              <p className="n-t-lg">{t}</p>
              <SpeakButton text={t} label="Hear this rule" />
            </li>
          ))}
        </ul>
      </section>

      <Link href="/assistants" className="n-link">Assistants (advanced)</Link>
    </>,
  );
}
