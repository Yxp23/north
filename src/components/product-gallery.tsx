"use client";
// The product's photos: a swipeable row with arrows and dots (all real buttons, so a keyboard works), and a tap on a photo opens the
// full-screen viewer with zoom. One photo shows no arrows or dots. The frame is the same one every product photo uses.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Photo } from "./photo";
import { PhotoViewer } from "./photo-viewer";
import { useAppearance } from "./shell/appearance";

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const { reduced } = useAppearance();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const many = images.length > 1;

  // Which photo is showing, read from where the row has scrolled to.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  const show = useCallback((i: number) => {
    const el = track.current;
    const n = Math.min(images.length - 1, Math.max(0, i));
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
    setActive(n);
  }, [images.length, reduced]);

  return (
    <div className="pg" role="group" aria-roledescription="carousel" aria-label={`Photos of ${name}`}>
      <div className="pg-stage">
        <div
          ref={track} className="pg-track"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); show(active + 1); }
            if (e.key === "ArrowLeft") { e.preventDefault(); show(active - 1); }
          }}
        >
          {images.map((src, i) => (
            <div key={src} className="pg-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${images.length}`}>
              <button type="button" className="pg-open" tabIndex={i === active ? 0 : -1} onClick={() => setViewer(i)} aria-label={`Open photo ${i + 1} of ${images.length} full screen`}>
                <Photo src={src} alt={many ? `${name}, photo ${i + 1} of ${images.length}` : name} className="ph-hero" />
              </button>
            </div>
          ))}
        </div>
        {many && (
          <>
            <button type="button" className="pg-arrow pg-prev" aria-label="Previous photo" disabled={active === 0} onClick={() => show(active - 1)}><ChevronLeft aria-hidden="true" /></button>
            <button type="button" className="pg-arrow pg-next" aria-label="Next photo" disabled={active === images.length - 1} onClick={() => show(active + 1)}><ChevronRight aria-hidden="true" /></button>
          </>
        )}
      </div>
      {many && (
        <div className="pg-dots" role="group" aria-label="Choose a photo">
          {images.map((src, i) => (
            <button key={src} type="button" className="pg-dot" aria-label={`Photo ${i + 1} of ${images.length}`} aria-current={i === active ? "true" : undefined} onClick={() => show(i)}><span /></button>
          ))}
        </div>
      )}
      <p className="n-hint pg-tip">Tap a photo to see it bigger.</p>
      {viewer !== null && <PhotoViewer images={images} start={viewer} name={name} onClose={() => setViewer(null)} />}
    </div>
  );
}
