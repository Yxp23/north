"use client";
// The animated pipeline: who asks, who helps, the Guardian, the signed approval, PayPal. You choose each step (or press "Play once");
// nothing moves by itself. The springs are the design's own. With reduced motion there is no movement, only the highlight.
import { BadgeCheck, Bot, MessageCircle, Pause, Play, ShieldCheck, Wallet, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppearance } from "@/components/shell/appearance";
import { MOTION, springSamples } from "@/lib/ui/springs";

type Step = { id: string; Icon: LucideIcon; title: string; sub: string; text: string; can: string; cannot: string; ai: boolean };
const STEPS: Step[] = [
  {
    id: "ask", Icon: MessageCircle, title: "You, or any AI assistant", sub: "An assistant connects through MCP", ai: false,
    text: "You ask North in your own words. An outside AI assistant can ask too, through the North Agent Checkpoint (an MCP server). It gets its own key. You can switch that key off at any time.",
    can: "Ask to buy something, and say why.", cannot: "Pay, refund, change a rule, or see your PayPal.",
  },
  {
    id: "helpers", Icon: Bot, title: "North's helpers", sub: "Concierge · Finder · Scam checker · Price Watcher", ai: true,
    text: "Four AI helpers read your words, find products, check deals and watch prices. Anything a helper says that becomes a number, a price or a rule is checked and written by code, never shown from model text.",
    can: "Read, find, warn, and suggest.", cannot: "Pay, refund, approve, or loosen a rule. They can only add caution.",
  },
  {
    id: "guardian", Icon: ShieldCheck, title: "Money Guardian", sub: "Plain code. No AI.", ai: false,
    text: "Every buy goes through the Guardian. It checks in a fixed order and answers approve, wait, save for later, or refuse, with a reason in plain words. It has tests that try thousands of random buys.",
    can: "Approve a payment. Only it can.", cannot: "Be talked into anything. The only AI input it takes is a caution flag, and a flag can only make it refuse.",
  },
  {
    id: "approval", Icon: BadgeCheck, title: "Signed approval", sub: "Single use · 2 minutes", ai: false,
    text: "When the Guardian says yes, it signs an approval for exactly this person, this item, this price and this quantity. It works once and runs out after 2 minutes. The payment code refuses to run without it.",
    can: "Unlock one payment, once.", cannot: "Be reused, changed, or used for a different item or price.",
  },
  {
    id: "paypal", Icon: Wallet, title: "PayPal", sub: "Your saved account, sandbox here", ai: false,
    text: "North charges your saved PayPal only with a valid approval. Receipts say Paid with PayPal and show PayPal's own order and capture numbers. In this practice version, the PayPal is a test account.",
    can: "Take one payment for the approved amount.", cannot: "Be called without an approval. No AI helper can reach it.",
  },
];

export function Pipeline() {
  const { reduced } = useAppearance();
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A spring pop on the step you chose, and the line leading to it fills in. Skipped when motion is reduced.
  useEffect(() => {
    if (active < 0 || reduced) return;
    const el = nodes.current[active];
    el?.animate?.(
      springSamples(MOTION.press.durationMs, MOTION.press.stiffness, MOTION.press.damping).map((s) => ({ transform: `scale(${MOTION.press.initialScale + (1 - MOTION.press.initialScale) * s.v})`, offset: s.offset })),
      { duration: MOTION.press.durationMs, easing: "linear" },
    );
    const fill = fills.current[active - 1];
    if (fill) {
      const vertical = window.matchMedia("(max-width: 860px)").matches;
      fill.animate?.(
        springSamples(MOTION.nav.durationMs, MOTION.nav.stiffness, MOTION.nav.damping).map((s) => ({ transform: vertical ? `scaleY(${Math.min(1, s.v)})` : `scaleX(${Math.min(1, s.v)})`, offset: s.offset })),
        { duration: MOTION.nav.durationMs, easing: "linear" },
      );
    }
  }, [active, reduced]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  }
  function playOnce() {
    stop();
    setPlaying(true);
    let i = 0;
    const next = () => {
      setActive(i);
      i += 1;
      if (i < STEPS.length) timer.current = setTimeout(next, 1800);
      else timer.current = setTimeout(() => setPlaying(false), 1800);
    };
    next();
  }
  const go = (i: number) => {
    stop();
    setActive(Math.max(0, Math.min(STEPS.length - 1, i)));
  };

  const cur = active >= 0 ? STEPS[active] : null;
  return (
    <div className="n-stack" style={{ gap: 18 }}>
      <ol className="hw-flow" aria-label="The path of a payment">
        {STEPS.map((s, i) => (
          <li key={s.id} className="hw-step">
            {i > 0 && (
              <span className="hw-conn" aria-hidden="true">
                <span ref={(el) => void (fills.current[i - 1] = el)} className="hw-fill" style={{ transform: active >= i ? undefined : "scale(0)" }} data-on={active >= i} />
              </span>
            )}
            <button
              ref={(el) => void (nodes.current[i] = el)} type="button" className={`hw-node ng-glass${active === i ? " hw-on" : ""}${active > i ? " hw-done" : ""}`}
              aria-pressed={active === i} onClick={() => go(i)}
            >
              <s.Icon aria-hidden="true" size={26} strokeWidth={1.5} />
              <span className="hw-num">Step {i + 1}</span>
              <strong>{s.title}</strong>
              <span className="hw-sub">{s.sub}</span>
              <span className="hw-tag">{s.id === "ask" ? "Can only ask" : s.ai ? "AI helps here" : "Plain code, no AI"}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="n-card n-stack" aria-live="polite" style={{ minHeight: 168 }}>
        {cur ? (
          <>
            <h3>Step {active + 1}: {cur.title}</h3>
            <p>{cur.text}</p>
            <p><span className="n-chip n-chip-good">Can</span> {cur.can}</p>
            <p><span className="n-chip n-chip-stop">Can&apos;t</span> {cur.cannot}</p>
          </>
        ) : (
          <>
            <h3>Pick a step to see what it does</h3>
            <p>Every payment follows the same five steps. Nothing moves by itself: you choose.</p>
          </>
        )}
      </div>

      <div className="hw-controls">
        <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={() => go(active - 1)} disabled={active <= 0}><ChevronLeft aria-hidden="true" />Back</button>
        <button type="button" className="n-btn n-btn-primary n-btn-auto" onClick={() => go(active + 1)} disabled={active >= STEPS.length - 1}>{active < 0 ? "Show me the steps" : "Next step"}<ChevronRight aria-hidden="true" /></button>
        {!reduced && (
          <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={playing ? stop : playOnce}>
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? "Stop" : "Play once"}
          </button>
        )}
      </div>
    </div>
  );
}
