// The approved design's springs, unchanged (design/north-design-handoff/tokens/spring-sampler.js and motion.json).
// An underdamped spring sampled at 49 frames (mass 1, the last frame forced to 1), played back with linear interpolation.
export type Sample = { v: number; offset: number };

export function springSamples(duration: number, stiffness = 340, damping = 22): Sample[] {
  const mass = 1;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const samples: Sample[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = ((i / 48) * duration) / 1000;
    const v = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    samples.push({ v: i === 48 ? 1 : v, offset: i / 48 });
  }
  return samples;
}

/** Durations and spring values from tokens/motion.json. */
export const MOTION = {
  press: { durationMs: 490, stiffness: 440, damping: 21, initialScale: 0.955 },
  nav: { durationMs: 560, stiffness: 350, damping: 21, stretch: 0.08 },
  sheet: { durationMs: 610, stiffness: 280, damping: 25, phoneY: 240, laptopY: 110 },
  /** A dialog on a laptop opens from this size (a spring scale) and shrinks back to it on close; a phone sheet slides. */
  dialog: { openScale: 0.94, openMs: 520, closeMs: 200, backdropMs: 220, stiffness: 300, damping: 24 },
  /** Letting go of a dragged phone sheet: past this far (px) or this fast (px per ms) it closes; otherwise it springs back. */
  dismiss: { distance: 120, velocity: 0.6, backMs: 460 },
} as const;

/** Button release: scale .955 back to 1, with the spring's overshoot. */
export const pressFrames = (): Keyframe[] =>
  springSamples(MOTION.press.durationMs, MOTION.press.stiffness, MOTION.press.damping).map((s) => ({
    transform: `scale(${MOTION.press.initialScale + (1 - MOTION.press.initialScale) * s.v})`,
    offset: s.offset,
  }));

/** Tab indicator: moves from `from` to `to` (pixels), stretching a little on the way. */
export const navFrames = (from: number, to: number): Keyframe[] =>
  springSamples(MOTION.nav.durationMs, MOTION.nav.stiffness, MOTION.nav.damping).map((s) => ({
    transform: `translateX(${from + (to - from) * s.v}px) scaleX(${1 + MOTION.nav.stretch * Math.sin(Math.PI * Math.min(1, s.v))})`,
    offset: s.offset,
  }));

/** Dialog entry. Laptop: 110px up and always centred (translateX(-50%)). Phone: a bottom sheet rising 240px. */
export const sheetFrames = (laptop: boolean): Keyframe[] =>
  springSamples(MOTION.sheet.durationMs, MOTION.sheet.stiffness, MOTION.sheet.damping).map((s) => ({
    transform: laptop ? `translate(-50%, ${(1 - s.v) * MOTION.sheet.laptopY}px)` : `translateY(${(1 - s.v) * MOTION.sheet.phoneY}px)`,
    opacity: Math.min(1, s.offset * 6),
    offset: s.offset,
  }));

/** Dialog open. Laptop: a spring scale from .94 to 1 while fading in (stays centred). Phone: the bottom sheet rises on the same spring. */
export const dialogOpenFrames = (laptop: boolean): Keyframe[] =>
  springSamples(MOTION.dialog.openMs, MOTION.dialog.stiffness, MOTION.dialog.damping).map((s) => ({
    transform: laptop
      ? `translate(-50%, 0) scale(${MOTION.dialog.openScale + (1 - MOTION.dialog.openScale) * s.v})`
      : `translateY(${(1 - s.v) * MOTION.sheet.phoneY}px)`,
    opacity: Math.min(1, s.offset * 6),
    offset: s.offset,
  }));

/**
 * Dialog close: the open played backwards and quicker. Laptop: shrinks to .94 and fades. Phone: slides back down from where it is
 * (`fromY` is how far a drag already moved it). The spring's overshoot is clamped so a closing dialog never grows first.
 */
export const dialogCloseFrames = (laptop: boolean, fromY = 0): Keyframe[] =>
  springSamples(MOTION.dialog.closeMs, MOTION.dialog.stiffness, MOTION.dialog.damping)
    .map((s) => ({ v: Math.min(1, s.v), offset: s.offset }))
    .map(({ v, offset }) => ({
      transform: laptop
        ? `translate(-50%, 0) scale(${MOTION.dialog.openScale + (1 - MOTION.dialog.openScale) * (1 - v)})`
        : `translateY(calc(${fromY}px + (100% - ${fromY}px) * ${v}))`,
      opacity: laptop ? 1 - v : 1,
      offset,
    }));

/** A dragged sheet let go before the dismiss distance: springs from `fromY` back to 0 (it overshoots a little, like the open). */
export const sheetBackFrames = (fromY: number): Keyframe[] =>
  springSamples(MOTION.dismiss.backMs, MOTION.sheet.stiffness, MOTION.sheet.damping).map((s) => ({ transform: `translateY(${fromY * (1 - s.v)}px)`, offset: s.offset }));

/** True when a let-go sheet should close: far enough down, or flicked down fast enough. */
export const shouldDismiss = (dy: number, velocityPxPerMs: number): boolean => dy > MOTION.dismiss.distance || (dy > 24 && velocityPxPerMs > MOTION.dismiss.velocity);

/** Dragging past the top: the sheet only follows a little (rubber band). */
export const dragOffset = (dy: number): number => (dy >= 0 ? dy : dy * 0.12);
