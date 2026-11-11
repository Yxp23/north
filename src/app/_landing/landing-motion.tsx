"use client";
// Scroll reveals for the front page. Each section (data-rv-group) reveals once, when it scrolls into view: its elements get the class "in", and the
// CSS (north-landing.css) rises and fades them in one after another using their --i place. transform and opacity only. With Reduce motion
// (North's own setting or the device's) everything is shown at once and nothing moves.
import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector(".lp2");
    if (!root) return;
    const groups = [...root.querySelectorAll<HTMLElement>("[data-rv-group]")];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!root.closest(".ng-reduced");
    const show = (g: HTMLElement) => g.querySelectorAll(".lp2-rv").forEach((el) => el.classList.add("in"));
    if (reduced || typeof IntersectionObserver === "undefined") {
      groups.forEach(show);
      return;
    }
    root.classList.add("lp2-armed"); // from here on, not-yet-revealed elements wait invisibly for their turn
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        show(e.target as HTMLElement);
        io.unobserve(e.target); // once per element
      }
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    groups.forEach((g) => io.observe(g));
    return () => io.disconnect();
  }, []);
  return null;
}
