"use client";
// The full-screen photo viewer. Pinch or scroll to zoom, drag to move a zoomed photo, swipe (or the arrows) to change photo, double tap to
// zoom, a big Close button. Every move also has a plain button or key, so nobody has to do a gesture. The pictures are the store's own
// flat photos: no pretend 3D. In video-safe mode a photo from a live store is hidden here too (see Photo).
import { ChevronLeft, ChevronRight, ImageOff, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { clampView, doubleTap, FIT, MAX_SCALE, swipeDirection, wheelFactor, zoomAbout, type View } from "@/lib/ui/zoom";
import { isBrandSafe } from "./photo";
import { useAppearance } from "./shell/appearance";

const FOCUSABLE = "button:not([disabled])";
type Size = { w: number; h: number };

export function PhotoViewer({ images, start, name, onClose }: { images: string[]; start: number; name: string; onClose(): void }) {
  const root = useSyncExternalStore(() => () => undefined, () => document.getElementById("north-dialog-root"), () => null);
  const { videoSafe } = useAppearance();
  const [index, setIndex] = useState(Math.min(Math.max(0, start), images.length - 1));
  const [view, setView] = useState<View>(FIT);
  const [drag, setDrag] = useState(0); // sideways drag of a photo at fit size, so it follows the finger
  const [busy, setBusy] = useState(false); // a finger or mouse is down: no easing while it moves
  const [fit, setFit] = useState<Size>({ w: 0, h: 0 });
  const overlay = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const natural = useRef<Size>({ w: 0, h: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: "pan" | "pinch" | "swipe"; dist0: number; view0: View; x0: number; y0: number; t0: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const fitRef = useRef(fit);
  useEffect(() => void (fitRef.current = fit), [fit]);
  const viewRef = useRef(view);
  useEffect(() => void (viewRef.current = view), [view]);
  const onCloseRef = useRef(onClose);
  useEffect(() => void (onCloseRef.current = onClose), [onClose]);

  const src = images[index];
  const hidden = videoSafe && !isBrandSafe(src);
  const many = images.length > 1;

  const stageSize = useCallback((): Size => ({ w: stage.current?.clientWidth ?? 0, h: stage.current?.clientHeight ?? 0 }), []);
  // The picture fitted whole inside the screen (the size at zoom 1). Zoom and pan are measured against it.
  const measure = useCallback(() => {
    const s = stageSize();
    const n = natural.current;
    if (!s.w || !n.w) return;
    const k = Math.min(s.w / n.w, s.h / n.h);
    setFit({ w: Math.round(n.w * k), h: Math.round(n.h * k) });
  }, [stageSize]);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, root]);

  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => Math.min(images.length - 1, Math.max(0, i + dir)));
    natural.current = { w: 0, h: 0 };
    setFit({ w: 0, h: 0 });
    setView(FIT);
  }, [images.length]);
  const zoomBy = useCallback((factor: number, point = { x: 0, y: 0 }) => setView((v) => zoomAbout(v, v.scale * factor, point, fit, stageSize())), [fit, stageSize]);

  // Focus, the page behind it can't be reached, Escape, arrows and the plus and minus keys.
  useEffect(() => {
    if (!root) return;
    const box = overlay.current;
    if (!box) return;
    const opener = document.activeElement as HTMLElement | null;
    const behind = [...document.querySelectorAll<HTMLElement>(".ng-content, .ng-controls, .ng-bts")];
    behind.forEach((el) => el.setAttribute("inert", ""));
    const scrollY = window.scrollY;
    document.documentElement.style.overflow = "hidden";
    box.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const zoomed = viewRef.current.scale > 1.01;
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key === "Tab") {
        const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return e.preventDefault();
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
        return;
      }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.4); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.4); }
      else if (e.key === "0") { e.preventDefault(); setView(FIT); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = 70;
        if (zoomed) {
          const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key] ?? [0, 0];
          setView((v) => clampView({ ...v, x: v.x + d[0], y: v.y + d[1] }, fitRef.current, stageSize()));
        } else if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      behind.forEach((el) => el.removeAttribute("inert"));
      document.documentElement.style.overflow = "";
      window.scrollTo({ top: scrollY });
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [root, go, zoomBy, stageSize]);

  // The mouse wheel and a trackpad pinch zoom where the pointer is. (A page-level listener, because the browser needs it to be non-passive.)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const point = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
      setView((v) => zoomAbout(v, v.scale * wheelFactor(e.deltaY), point, fitRef.current, stageSize()));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [stageSize, root]);

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function down(e: React.PointerEvent) {
    stage.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setBusy(true);
    if (pointers.current.size === 2) {
      gesture.current = { mode: "pinch", dist0: distance() || 1, view0: viewRef.current, x0: 0, y0: 0, t0: Date.now(), moved: true };
    } else {
      gesture.current = { mode: viewRef.current.scale > 1.01 ? "pan" : "swipe", dist0: 0, view0: viewRef.current, x0: e.clientX, y0: e.clientY, t0: Date.now(), moved: false };
    }
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    const prev = pointers.current.get(e.pointerId);
    if (!g || !prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = rel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      setView(zoomAbout(g.view0, g.view0.scale * (distance() / g.dist0), mid, fit, stageSize()));
    } else if (g.mode === "pan") {
      g.moved ||= Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 8;
      setView((v) => clampView({ ...v, x: v.x + (e.clientX - prev.x), y: v.y + (e.clientY - prev.y) }, fit, stageSize()));
    } else if (g.mode === "swipe") {
      g.moved ||= Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 8;
      if (many) setDrag(Math.abs(e.clientX - g.x0) > Math.abs(e.clientY - g.y0) ? e.clientX - g.x0 : 0);
    }
  }
  function up(e: React.PointerEvent) {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      gesture.current = g && { ...g, mode: "pan", view0: viewRef.current, moved: true };
      return;
    }
    setBusy(false);
    setDrag(0);
    gesture.current = null;
    if (!g || e.type === "pointercancel") return;
    if (g.mode === "swipe" && many) {
      const dir = swipeDirection(e.clientX - g.x0, e.clientY - g.y0);
      if (dir) return go(dir);
    }
    // A quick tap that did not move: two of them close together zoom in or out.
    if (!g.moved && Date.now() - g.t0 < 350) {
      const last = lastTap.current;
      if (last && Date.now() - last.t < 350 && Math.hypot(last.x - e.clientX, last.y - e.clientY) < 30) {
        setView((v) => doubleTap(v, rel(e), fit, stageSize()));
        lastTap.current = null;
      } else lastTap.current = { t: Date.now(), x: e.clientX, y: e.clientY };
    }
  }

  if (!root) return null;
  const zoomed = view.scale > 1.01;
  return createPortal(
    <div ref={overlay} className={`pv${busy ? " pv-busy" : ""}`} role="dialog" aria-modal="true" aria-label={`Photos of ${name}`}>
      <div className="pv-top">
        <p className="pv-count" role="status" aria-live="polite">Photo {index + 1} of {images.length}</p>
        <button type="button" className="pv-btn pv-close" data-autofocus onClick={onClose}><X aria-hidden="true" /><span>Close</span></button>
      </div>
      <div ref={stage} className="pv-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ cursor: zoomed ? "grab" : "default" }}>
        {hidden ? (
          <span className="pv-hidden" role="img" aria-label="Photo hidden"><ImageOff aria-hidden="true" /><span>Photo hidden</span></span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src} src={src} alt={`${name}, photo ${index + 1} of ${images.length}`} draggable={false}
            onLoad={(e) => { natural.current = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }; measure(); }}
            style={{ width: fit.w || undefined, height: fit.h || undefined, maxWidth: fit.w ? "none" : "100%", maxHeight: fit.h ? "none" : "100%", transform: `translate(${view.x + drag}px, ${view.y}px) scale(${view.scale})` }}
          />
        )}
      </div>
      {many && (
        <>
          <button type="button" className="pv-btn pv-prev" aria-label="Previous photo" disabled={index === 0} onClick={() => go(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" className="pv-btn pv-next" aria-label="Next photo" disabled={index === images.length - 1} onClick={() => go(1)}><ChevronRight aria-hidden="true" /></button>
        </>
      )}
      <div className="pv-bottom">
        <div className="pv-zoom" role="group" aria-label="Zoom">
          <button type="button" className="pv-btn" aria-label="Zoom out" disabled={!zoomed} onClick={() => zoomBy(1 / 1.5)}><Minus aria-hidden="true" /></button>
          <button type="button" className="pv-btn pv-reset" disabled={!zoomed} onClick={() => setView(FIT)}>Fit</button>
          <button type="button" className="pv-btn" aria-label="Zoom in" disabled={view.scale >= MAX_SCALE - 0.01 || hidden} onClick={() => zoomBy(1.5)}><Plus aria-hidden="true" /></button>
        </div>
        <p className="pv-hint">Pinch or scroll to zoom. Drag to move.{many ? " Swipe for the next photo." : ""}</p>
      </div>
    </div>,
    root,
  );
}
