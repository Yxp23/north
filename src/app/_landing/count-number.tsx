"use client";
// A number that counts up once when it scrolls into view: fast at first, then slowing down. The server (and Reduce motion) show the final number.
import { useEffect, useRef } from "react";

export function CountNumber({ to, suffix = "", ms = 1200 }: { to: number; suffix?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!el.closest(".ng-reduced");
    if (reduced || to <= 0 || typeof IntersectionObserver === "undefined") return;
    el.textContent = `0${suffix}`; // starts at zero while its card is still waiting to appear
    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        el.textContent = `${Math.round(to * eased)}${suffix}`;
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, suffix, ms]);
  return <span ref={ref}>{to}{suffix}</span>;
}
