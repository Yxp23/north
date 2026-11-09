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
  shineMs: 700,
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
