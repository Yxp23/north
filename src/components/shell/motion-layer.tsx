"use client";
// The approved interactions, attached once for the whole app: a spring rebound when a control is pressed, and the thin bright rim of glass
// that leans toward the pointer. (There is no sweep across the whole surface any more: only the edge catches the light.)
// Nothing loops and nothing runs on its own. Off when motion is reduced.
import { useEffect } from "react";
import { MOTION, pressFrames } from "@/lib/ui/springs";

const PRESSABLE = ".n-btn, .ng-find, .ng-top-help, .ng-ask, .ng-nav a, .ng-saved, .ng-theme-choice, .n-speak, .ng-sheet-close, .ng-appearance-close, button.n-link";

function motionOn(): boolean {
  const root = document.querySelector(".north-app");
  return !!root && !root.classList.contains("ng-reduced") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function press(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function" || !motionOn()) return;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(pressFrames(), { duration: MOTION.press.durationMs, easing: "linear", fill: "none" });
}

export function MotionLayer() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
      if (el && !(el as HTMLButtonElement).disabled) press(el);
    };
    const onMove = (e: PointerEvent) => {
      const glass = (e.target as Element | null)?.closest<HTMLElement>(".ng-glass");
      if (!glass || !motionOn() || glass.closest(".ng-solid")) return;
      const r = glass.getBoundingClientRect();
      glass.style.setProperty("--light-x", `${(100 * (e.clientX - r.left)) / r.width}%`);
      glass.style.setProperty("--light-y", `${(100 * (e.clientY - r.top)) / r.height}%`);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);
  return null;
}
