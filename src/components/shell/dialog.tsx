"use client";
// A properly managed dialog: a bottom sheet on phones, a centred dialog on laptops. Focus moves in, stays inside, and goes back to
// what opened it. Escape closes it. The rest of the page is inert while it is open.
// Motion (all off with Reduce motion): it opens on a spring (a laptop dialog grows from 94% while fading in, a phone sheet rises) with the
// backdrop fading in, and it closes by playing that backwards BEFORE it goes. A phone sheet can be dragged down by its top and let go:
// far or fast closes it, otherwise it springs back.
import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { dialogCloseFrames, dialogOpenFrames, dragOffset, MOTION, sheetBackFrames, shouldDismiss } from "@/lib/ui/springs";
import { useAppearance } from "./appearance";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/** An inert copy of the dialog (and its backdrop) that plays the close and then removes itself. */
function playCloseCopy(root: HTMLElement, sheet: HTMLElement, dim: HTMLElement | null, dragY: number) {
  const laptop = window.matchMedia("(min-width: 651px)").matches;
  const copy = (el: HTMLElement) => {
    const g = el.cloneNode(true) as HTMLElement;
    g.setAttribute("aria-hidden", "true");
    g.setAttribute("inert", "");
    for (const a of ["role", "aria-modal", "aria-labelledby", "tabindex"]) g.removeAttribute(a);
    g.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    g.querySelectorAll("[data-autofocus]").forEach((n) => n.removeAttribute("data-autofocus"));
    g.style.pointerEvents = "none";
    return g;
  };
  const sheetCopy = copy(sheet);
  const dimCopy = dim ? copy(dim) : null;
  const nodes = dimCopy ? [sheetCopy, dimCopy] : [sheetCopy];
  nodes.forEach((n) => root.appendChild(n));
  const done = () => nodes.forEach((n) => n.remove());
  const a = sheetCopy.animate(dialogCloseFrames(laptop, laptop ? 0 : dragY), {
    duration: MOTION.dialog.closeMs,
    easing: "linear",
    fill: "forwards",
  });
  dimCopy?.animate([{ opacity: Number(dim?.style.opacity || 1) }, { opacity: 0 }], { duration: MOTION.dialog.closeMs, easing: "ease-in", fill: "forwards" });
  a.onfinish = done;
  a.oncancel = done;
  window.setTimeout(done, MOTION.dialog.closeMs + 150); // never leave a copy behind
}

export function Dialog({
  label,
  onClose,
  children,
  pinned,
  wide = false,
  closeLabel = "Close",
  dismissable = true,
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
  const root = useSyncExternalStore(
    () => () => undefined,
    () => document.getElementById("north-dialog-root"),
    () => null,
  );
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const { reduced } = useAppearance();
  const reducedRef = useRef(reduced);
  useEffect(() => void (reducedRef.current = reduced), [reduced]);
  const dragRef = useRef<{
    y0: number;
    samples: { y: number; t: number }[];
    dy: number;
  } | null>(null);
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

    // The spring entry: the backdrop fades in; a laptop dialog grows from 94% while fading in; a phone sheet rises.
    const laptop = window.matchMedia("(min-width: 651px)").matches;
    if (!reduced && typeof sheet.animate === "function") {
      sheet.animate(dialogOpenFrames(laptop), {
        duration: MOTION.dialog.openMs,
        easing: "linear",
        fill: "none",
      });
      dimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: MOTION.dialog.backdropMs,
        easing: "ease-out",
        fill: "none",
      });
    }
    (sheet.querySelector<HTMLElement>("[data-autofocus]") ?? sheet).focus({
      preventScroll: true,
    });
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

  // Closing: whichever way the dialog goes away (its Close button, Escape, a button inside, a drag, or the page moving on), a copy of it plays
  // the open backwards and is then removed. The copy is inert and hidden from screen readers; the real dialog is already gone, so focus and
  // the page behind are back at once. With Reduce motion there is no copy.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const dim = dimRef.current;
    if (!root || !sheet) return;
    return () => {
      if (reducedRef.current || typeof sheet.animate !== "function") return;
      // Only when the dialog is really gone: in development React runs this once at the start too, and then the dialog is still on the page.
      queueMicrotask(() => {
        if (!sheet.isConnected) playCloseCopy(root, sheet, dim, dragRef.current && dragRef.current.dy > 0 ? dragOffset(dragRef.current.dy) : 0);
      });
    };
  }, [root]);

  // Phone only: drag the sheet down by its top. Let go far enough (or fast enough) and it closes; otherwise it springs back.
  const canDrag = () => dismissable && window.matchMedia("(max-width: 650px)").matches;
  const dragProps = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (!canDrag() || (e.pointerType === "mouse" && e.button !== 0) || (e.target as HTMLElement).closest("button,a,summary,input,select,textarea")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        y0: e.clientY,
        samples: [{ y: e.clientY, t: e.timeStamp }],
        dy: 0,
      };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const d = dragRef.current;
      const sheet = sheetRef.current;
      if (!d || !sheet) return;
      d.dy = e.clientY - d.y0;
      d.samples = [...d.samples.slice(-4), { y: e.clientY, t: e.timeStamp }];
      const off = dragOffset(d.dy);
      sheet.style.transform = `translateY(${off}px)`;
      if (dimRef.current) dimRef.current.style.opacity = String(1 - Math.min(1, Math.max(0, off) / sheet.offsetHeight) * 0.85);
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const d = dragRef.current;
      const sheet = sheetRef.current;
      if (!d || !sheet) return;
      const first = d.samples[0];
      const velocity = e.timeStamp > first.t ? (e.clientY - first.y) / (e.timeStamp - first.t) : 0;
      if (e.type === "pointerup" && shouldDismiss(d.dy, velocity)) {
        onCloseRef.current(); // the copy made on the way out carries on from where the drag stopped
        window.setTimeout(() => {
          // a dialog the page chose to keep open comes back
          if (sheet.isConnected) {
            sheet.style.transform = "";
            if (dimRef.current) dimRef.current.style.opacity = "";
            dragRef.current = null;
          }
        }, 120);
        return;
      }
      const off = dragOffset(d.dy);
      dragRef.current = null;
      sheet.style.transform = "";
      if (dimRef.current) dimRef.current.style.opacity = "";
      if (!reducedRef.current && typeof sheet.animate === "function" && Math.abs(off) > 1)
        sheet.animate(sheetBackFrames(off), {
          duration: MOTION.dismiss.backMs,
          easing: "linear",
          fill: "none",
        });
    },
  };

  // A new screen inside the same dialog (the check finishing, an answer replacing "checking") always starts at the top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [label, root]);

  if (!root) return null;
  return createPortal(
    <>
      <div ref={dimRef} className="ng-sheet-dimmer" />
      <div ref={sheetRef} className={`ng-sheet${wide ? " ng-sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ng-handle" aria-hidden="true" {...dragProps} />
        {/* The head never scrolls: the close button and, for a decision, its answer. */}
        <div className={`ng-sheet-head${pinned ? "" : " ng-sheet-head-bare"}`} {...dragProps}>
          {pinned}
          {dismissable && (
            <button type="button" className="ng-sheet-close ng-glass" aria-label={closeLabel} onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          )}
        </div>
        <span id={titleId} className="ng-vh">
          {label}
        </span>
        {/* The only scrolling part. It sits inside the rounded frame, so its scrollbar can never poke out of a corner. */}
        <div ref={scrollRef} className="ng-sheet-scroll">
          {children}
        </div>
      </div>
    </>,
    root,
  );
}
