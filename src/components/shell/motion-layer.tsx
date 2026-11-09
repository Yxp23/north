"use client";
// The approved interactions, attached once for the whole app: a spring rebound and one brief reflective sweep when a control is pressed,
// and the glass highlight that follows the pointer. Nothing loops and nothing runs on its own. Off when motion is reduced.
import { useEffect } from "react";
import { MOTION, pressFrames } from "@/lib/ui/springs";

const PRESSABLE = ".n-btn, .ng-find, .ng-top-help, .ng-ask, .ng-nav a, .ng-saved, .ng-theme-choice, .n-speak, .ng-sheet-close, .ng-appearance-close, button.n-link";
const SHINES = ".ng-glass, .n-btn-primary, .ng-find";

function motionOn(): boolean {
  const root = document.querySelector(".north-app");
  return !!root && !root.classList.contains("ng-reduced") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function shine(el: Element | null) {
  if (!el || !motionOn()) return;
  if (el.closest(".ng-solid") && el.classList.contains("ng-glass")) return;
  el.classList.remove("ng-shine");
  void (el as HTMLElement).offsetWidth; // restart the one sweep
  el.classList.add("ng-shine");
  setTimeout(() => el.classList.remove("ng-shine"), MOTION.shineMs + 60);
}

export function press(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function" || !motionOn()) return;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(pressFrames(), { duration: MOTION.press.durationMs, easing: "linear", fill: "none" });
  if (el.matches(SHINES)) shine(el);
}

export function MotionLayer() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
      if (el && !(el as HTMLButtonElement).disabled) press(el);
    };
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(SHINES);
      if (el && motionOn()) shine(el);
    };
    const onMove = (e: PointerEvent) => {
      const glass = (e.target as Element | null)?.closest<HTMLElement>(".ng-glass");
      if (!glass || !motionOn() || glass.closest(".ng-solid")) return;
      const r = glass.getBoundingClientRect();
      glass.style.setProperty("--light-x", `${(100 * (e.clientX - r.left)) / r.width}%`);
      glass.style.setProperty("--light-y", `${(100 * (e.clientY - r.top)) / r.height}%`);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);
  return null;
}
