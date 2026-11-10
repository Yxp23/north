// Zoom and pan for the full-screen photo viewer. Pure maths, so it can be tested: the picture is fitted inside the screen first (scale 1),
// zoom only makes it bigger, and panning can never drag the picture off so far that empty space shows beside it.
export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
export type View = { scale: number; x: number; y: number };
type Size = { w: number; h: number };
export const FIT: View = { scale: 1, x: 0, y: 0 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keep the view legal: scale within range, and the pan inside what the zoomed picture covers (centred when it is smaller than the screen). */
export function clampView(v: View, img: Size, stage: Size): View {
  const scale = clamp(v.scale, MIN_SCALE, MAX_SCALE);
  if (scale === MIN_SCALE) return FIT;
  const limitX = Math.max(0, (img.w * scale - stage.w) / 2);
  const limitY = Math.max(0, (img.h * scale - stage.h) / 2);
  return { scale, x: clamp(v.x, -limitX, limitX), y: clamp(v.y, -limitY, limitY) };
}

/** Change the zoom while the spot under `point` (measured from the screen's centre) stays put: a pinch, a wheel turn, a double tap. */
export function zoomAbout(v: View, nextScale: number, point: { x: number; y: number }, img: Size, stage: Size): View {
  const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const ratio = scale / v.scale;
  return clampView({ scale, x: point.x - (point.x - v.x) * ratio, y: point.y - (point.y - v.y) * ratio }, img, stage);
}

/** A double tap: zoom in to 2.5 times where tapped, or back to fitting the screen if already zoomed. */
export const doubleTap = (v: View, point: { x: number; y: number }, img: Size, stage: Size): View =>
  v.scale > 1.01 ? FIT : zoomAbout(v, 2.5, point, img, stage);

/** One wheel turn (or trackpad pinch) as a zoom factor. */
export const wheelFactor = (deltaY: number): number => Math.exp(-clamp(deltaY, -200, 200) * 0.0022);

/** Does a sideways drag at fit-size count as "next or previous photo"? Returns -1, 0 or 1. */
export const swipeDirection = (dx: number, dy: number, threshold = 60): -1 | 0 | 1 => (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx < 0 ? 1 : -1) : 0);
