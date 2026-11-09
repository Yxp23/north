"use client";
// Smooth expand and collapse, with the approved spring. A button controls the region it opens (aria-expanded). With reduced motion it just opens.
import { ChevronDown } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MOTION, springSamples } from "@/lib/ui/springs";
import { useAppearance } from "./shell/appearance";

export function Disclosure({ summary, children, defaultOpen = false, className = "", flush = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; flush?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { reduced } = useAppearance();
  const box = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const id = useId();

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (first.current) {
      first.current = false;
      el.hidden = !open;
      return;
    }
    el.getAnimations().forEach((a) => a.cancel());
    if (reduced || typeof el.animate !== "function") {
      el.hidden = !open;
      return;
    }
    const spring = springSamples(MOTION.nav.durationMs, MOTION.nav.stiffness, MOTION.nav.damping);
    if (open) {
      el.hidden = false;
      const h = el.scrollHeight;
      el.animate(spring.map((s) => ({ height: `${h * Math.min(1, s.v)}px`, opacity: Math.min(1, s.v * 1.5), offset: s.offset })), { duration: MOTION.nav.durationMs, easing: "linear" });
    } else {
      const h = el.offsetHeight;
      const a = el.animate(spring.map((s) => ({ height: `${h * (1 - Math.min(1, s.v))}px`, opacity: 1 - Math.min(1, s.v), offset: s.offset })), { duration: MOTION.nav.durationMs, easing: "linear" });
      a.onfinish = () => void (el.hidden = true);
    }
  }, [open, reduced]);

  return (
    <div className={`n-disc${flush ? " n-disc-flush" : ""} ${className}`}>
      <button type="button" className="n-disc-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span>{summary}</span>
        <ChevronDown aria-hidden="true" className="n-disc-chev" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      <div id={id} ref={box} className="n-disc-body" role="region" hidden={!defaultOpen}>{children}</div>
    </div>
  );
}
