"use client";
// What North did this week, in plain words: every buy it said yes to, waited on, saved or stopped, and every scam it caught. Read-only.
import { Bookmark, Bot, Check, Clock, Eye, Hand, ShieldAlert, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, ErrorNote, Loading } from "@/components/states";
import { useMask } from "@/components/shell/mask";
import type { ActivityIcon, ActivityLine, ActivityTone } from "@/lib/ledger/activity";

const ICON: Record<ActivityIcon, LucideIcon> = { check: Check, clock: Clock, bookmark: Bookmark, hand: Hand, shield: ShieldAlert, bot: Bot, undo: Undo2, eye: Eye, wallet: Wallet };
const TONE: Record<ActivityTone, string> = { good: "n-chip-good", wait: "n-chip-wait", stop: "n-chip-stop", quiet: "n-chip-quiet" };
const WORD: Record<ActivityTone, string> = { good: "Done", wait: "Waiting", stop: "Stopped", quiet: "Note" };

export function ActivityPage() {
  const [lines, setLines] = useState<ActivityLine[] | null>(null);
  const [error, setError] = useState(false);
  const m = useMask();
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/activity", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setLines((await r.json()).lines);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="n-col" style={{ maxWidth: 720 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Home · This week</div>
        <h1>What North<br />did for you.</h1>
        <p>Every buy it said yes to, waited on, saved or stopped this week.</p>
      </div>
      {error ? <ErrorNote what="this week" onRetry={load} /> : !lines ? <Loading what="this week" /> : lines.length === 0 ? (
        <Empty>North has not had to do anything this week yet.</Empty>
      ) : (
        <ul className="n-stack" style={{ gap: 12 }}>
          {lines.map((l, i) => {
            const Icon = ICON[l.icon];
            return (
              <li key={i} className="n-card n-stack n-gap-1">
                <p className={`n-chip ${TONE[l.tone]} n-self-start`}><Icon aria-hidden="true" />{WORD[l.tone]}</p>
                <p className="n-t-lg">{m.text(l.text)}</p>
                <p className="n-muted">{new Date(l.at).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
