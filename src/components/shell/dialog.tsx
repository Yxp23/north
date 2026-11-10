"use client";
// A properly managed dialog: a bottom sheet on phones, a centred dialog on laptops. Focus moves in, stays inside, and goes back to
// what opened it. Escape closes it. The rest of the page is inert while it is open. It enters with the approved spring and closes at once.
import { X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { sheetFrames, MOTION } from "@/lib/ui/springs";
import { useAppearance } from "./appearance";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

export function Dialog({
  label, onClose, children, pinned, wide = false, closeLabel = "Close", dismissable = true,
}: {
  /** The dialog's name for screen readers. Shown as its heading by the caller. */
  label: string;
  onClose(): void;
  children: ReactNode;
  /** Stays at the top, outside the scrolling part, so nothing can ever scroll under it (a decision's answer). */
  pinned?: ReactNode;
  wide?: boolean;
  closeLabel?: string;
  dismissable?: boolean;
}) {
  // The place dialogs are drawn (inside the themed app root). Read from the page; the server has none.
  const root = useSyncExternalStore(() => () => undefined, () => document.getElementById("north-dialog-root"), () => null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { reduced } = useAppearance();
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => void (onCloseRef.current = onClose), [onClose]);

  useEffect(() => {
    if (!root) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const opener = document.activeElement as HTMLElement | null;
    // Everything behind the dialog can't be reached while it is open.
    const behind = [...document.querySelectorAll<HTMLElement>(".ng-content, .ng-controls, .ng-bts")];
    behind.forEach((el) => el.setAttribute("inert", ""));
    const scrollY = window.scrollY;
    document.documentElement.style.overflow = "hidden";

    // The spring entry (the phone sheet rises 240px; the laptop dialog rises 110px and stays centred).
    const laptop = window.matchMedia("(min-width: 651px)").matches;
    if (!reduced && typeof sheet.animate === "function") sheet.animate(sheetFrames(laptop), { duration: MOTION.sheet.durationMs, easing: "linear", fill: "none" });
    (sheet.querySelector<HTMLElement>("[data-autofocus]") ?? sheet).focus({ preventScroll: true });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (items.length === 0) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      behind.forEach((el) => el.removeAttribute("inert"));
      document.documentElement.style.overflow = "";
      window.scrollTo({ top: scrollY });
      // Back to what opened it, if it is still on the page.
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [root, reduced, dismissable]);

  // A new screen inside the same dialog (the check finishing, an answer replacing "checking") always starts at the top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [label, root]);

  if (!root) return null;
  return createPortal(
    <>
      <div className="ng-sheet-dimmer" />
      <div ref={sheetRef} className={`ng-sheet${wide ? " ng-sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ng-handle" aria-hidden="true" />
        {/* The head never scrolls: the close button and, for a decision, its answer. */}
        <div className={`ng-sheet-head${pinned ? "" : " ng-sheet-head-bare"}`}>
          {pinned}
          {dismissable && (
            <button type="button" className="ng-sheet-close ng-glass" aria-label={closeLabel} onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          )}
        </div>
        <span id={titleId} className="ng-vh">{label}</span>
        {/* The only scrolling part. It sits inside the rounded frame, so its scrollbar can never poke out of a corner. */}
        <div ref={scrollRef} className="ng-sheet-scroll">{children}</div>
      </div>
    </>,
    root,
  );
}
