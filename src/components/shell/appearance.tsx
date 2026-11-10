"use client";
// Appearance: the colour theme, reduced motion, solid surfaces and the "Behind the scenes" panel. These are display choices only:
// they live in this browser's local storage, are independent of one another, and never touch a rule, a payment or a permission.
// Nothing secret is ever stored here.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export const THEMES = [
  { id: "tide", name: "Tide", note: "Water · sea glass", disc: "linear-gradient(145deg,#f0f7f8 8%,#b3d6de 55%,#2b5c66)" },
  { id: "dune", name: "Dune", note: "Earth · warm mineral", disc: "linear-gradient(145deg,#f7f2eb 8%,#dfc1a6 55%,#765145)" },
  { id: "grove", name: "Grove", note: "Leaves · soft olive", disc: "linear-gradient(145deg,#f3f5ed 8%,#c1ce9e 55%,#4d6340)" },
  { id: "opal", name: "Opal", note: "Light · pearl silver", disc: "linear-gradient(145deg,#f5f5f2 8%,#d5dcd9 55%,#303335)" },
  { id: "bloom", name: "Bloom", note: "Petals · soft rosewood", disc: "linear-gradient(145deg,#f9f3f3 8%,#e4c6d0 55%,#78505f)" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "bloom";

/** Light, Dark, or "auto" = match the device (the default). */
export type Mode = "light" | "dark" | "auto";
export const MODES: { id: Mode; label: string }[] = [{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "auto", label: "Match my device" }];
type Prefs = { theme: ThemeId; mode: Mode; reduce: boolean; solid: boolean | null; behind: boolean; videoSafe: boolean };
const DEFAULTS: Prefs = { theme: DEFAULT_THEME, mode: "auto", reduce: false, solid: null, behind: false, videoSafe: false };
const KEY = "north-appearance";

export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULTS;
  try {
    const j = JSON.parse(raw) as Partial<Prefs>;
    return {
      theme: THEMES.some((t) => t.id === j.theme) ? (j.theme as ThemeId) : DEFAULT_THEME,
      mode: j.mode === "light" || j.mode === "dark" ? j.mode : "auto",
      reduce: j.reduce === true,
      solid: typeof j.solid === "boolean" ? j.solid : null,
      behind: j.behind === true,
      videoSafe: j.videoSafe === true,
    };
  } catch {
    return DEFAULTS;
  }
}

// A tiny external store, so the server and the browser agree on the first render and every tab stays in step.
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Prefs = DEFAULTS;
function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage can be blocked; the app still works with the defaults
  }
}
function snapshot(): Prefs {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parsePrefs(raw);
  }
  return cached;
}
function write(next: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* blocked storage: keep going, the choice just won't be remembered */
  }
  cachedRaw = undefined;
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener?.("change", cb);
      return () => m.removeEventListener?.("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type Appearance = {
  theme: ThemeId;
  setTheme(t: ThemeId): void;
  /** What the person chose, and what is showing now (the device decides when it is "auto"). */
  mode: Mode;
  setMode(m: Mode): void;
  dark: boolean;
  /** True when motion is off, from the Reduce motion choice or the device's own setting. */
  reduced: boolean;
  /** The device asks for less motion: the choice can't turn it back on. */
  osReduced: boolean;
  setReduce(v: boolean): void;
  solid: boolean;
  setSolid(v: boolean): void;
  behind: boolean;
  setBehind(v: boolean): void;
  /** Real prices stay; store and product names are hidden and photos blurred. For recording the demo. */
  videoSafe: boolean;
  setVideoSafe(v: boolean): void;
};
const Ctx = createContext<Appearance | null>(null);

export function useAppearance(): Appearance {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppearance must be used inside AppearanceProvider");
  return v;
}

/** `forceVideoSafe`: the deployment switched video-safe mode on for a recording (VIDEO_SAFE=1). Read by the server layout, never exposed as a public variable. */
/** The root of every screen: carries the display choices as classes (the theme and mode are on <html>). */
export function AppearanceProvider({ children, forceVideoSafe = false }: { children: ReactNode; forceVideoSafe?: boolean }) {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);
  const osReduced = useMedia("(prefers-reduced-motion: reduce)");
  const osSolid = useMedia("(prefers-reduced-transparency: reduce)");
  const osDark = useMedia("(prefers-color-scheme: dark)");
  const dark = prefs.mode === "dark" || (prefs.mode === "auto" && osDark);
  const reduced = prefs.reduce || osReduced;
  const solid = prefs.solid ?? osSolid;

  const setTheme = useCallback((theme: ThemeId) => write({ ...snapshot(), theme }), []);
  const setMode = useCallback((mode: Mode) => write({ ...snapshot(), mode }), []);
  const setReduce = useCallback((reduce: boolean) => write({ ...snapshot(), reduce }), []);
  const setSolid = useCallback((s: boolean) => write({ ...snapshot(), solid: s }), []);
  const setBehind = useCallback((behind: boolean) => write({ ...snapshot(), behind }), []);
  const setVideoSafe = useCallback((videoSafe: boolean) => write({ ...snapshot(), videoSafe }), []);
  const videoSafe = prefs.videoSafe || forceVideoSafe;

  // The theme and the mode sit on <html> (CSS reads them there). A script in <head> sets them before the first paint (see layout.tsx),
  // so this only has to keep them in step when the person changes a choice.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.mode = dark ? "dark" : "light";
  }, [prefs.theme, dark]);

  const value = useMemo<Appearance>(
    () => ({ theme: prefs.theme, setTheme, mode: prefs.mode, setMode, dark, reduced, osReduced, setReduce, solid, setSolid, behind: prefs.behind, setBehind, videoSafe, setVideoSafe }),
    [prefs.theme, prefs.mode, dark, prefs.behind, reduced, osReduced, solid, videoSafe, setTheme, setMode, setReduce, setSolid, setBehind, setVideoSafe],
  );

  return (
    <Ctx.Provider value={value}>
      <div
        className={`north-app${solid ? " ng-solid" : ""}${reduced ? " ng-reduced" : ""}${prefs.behind ? " ng-has-bts" : ""}${videoSafe ? " ng-videosafe" : ""}`}
      >
        <div className="ng-landscape" aria-hidden="true" />
        {children}
        <div id="north-dialog-root" />
      </div>
    </Ctx.Provider>
  );
}
