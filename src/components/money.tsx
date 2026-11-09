"use client";
// Money as the design shows it: whole dollars large, cents smaller, and one continuous amount for a screen reader.
// The number counts up once with the approved spring when it appears or changes (never looping; off with reduced motion).
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { MOTION, springSamples } from "@/lib/ui/springs";
import { realThings } from "@/lib/ui/real-things";
import { useAppearance } from "./shell/appearance";

function useCountUp(target: number): number {
  const { reduced } = useAppearance();
  const [shown, setShown] = useState(target);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (reduced) {
      from.current = target;
      const t = setTimeout(() => setShown(target), 0);
      return () => clearTimeout(t);
    }
    const start = from.current ?? 0;
    from.current = target;
    if (start === target) return;
    const frames = springSamples(MOTION.nav.durationMs, MOTION.nav.stiffness, MOTION.nav.damping);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / MOTION.nav.durationMs);
      const f = frames[Math.min(48, Math.round(p * 48))];
      setShown(Math.round(start + (target - start) * Math.min(1, f.v)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShown(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return shown;
}

export function BigMoney({ cents, label }: { cents: number; label?: string }) {
  const shown = useCountUp(cents);
  const [dollars, c] = formatMoney(shown).split("."); // "$1,234" and "56"
  return (
    <div className="ng-amount">
      <span className="ng-vh">{label ? `${label}: ` : ""}{formatMoney(cents)}</span>
      <span aria-hidden="true" style={{ fontSize: "inherit", letterSpacing: "inherit" }}>
        {dollars}
        <span className="ng-cents">.{c}</span>
      </span>
    </div>
  );
}

/** "That is about 6 lunches." next to a big amount. A rough guide, and it says what it counted. */
export function RealThingsLine({ cents, className = "ng-real" }: { cents: number; className?: string }) {
  const r = realThings(cents);
  if (!r) return null;
  return (
    <p className={className} title={r.basis}>
      That is {r.text}. <span className="ng-vh">{r.basis}</span>
    </p>
  );
}
