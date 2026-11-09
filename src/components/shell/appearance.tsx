"use client";
// Appearance: the colour theme, reduced motion, solid surfaces and the "Behind the scenes" panel. These are display choices only:
// they live in this browser's local storage, are independent of one another, and never touch a rule, a payment or a permission.
// Nothing secret is ever stored here.
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export const THEMES = [
  { id: "tide", name: "Tide", note: "Water · sea glass", disc: "linear-gradient(145deg,#f0f7f8 8%,#b3d6de 55%,#2b5c66)" },
  { id: "dune", name: "Dune", note: "Earth · warm mineral", disc: "linear-gradient(145deg,#f7f2eb 8%,#dfc1a6 55%,#765145)" },
  { id: "grove", name: "Grove", note: "Leaves · soft olive", disc: "linear-gradient(145deg,#f3f5ed 8%,#c1ce9e 55%,#4d6340)" },
  { id: "opal", name: "Opal", note: "Light · pearl silver", disc: "linear-gradient(145deg,#f5f5f2 8%,#d5dcd9 55%,#303335)" },
  { id: "bloom", name: "Bloom", note: "Petals · soft rosewood", disc: "linear-gradient(145deg,#f9f3f3 8%,#e4c6d0 55%,#78505f)" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "bloom";

type Prefs = { theme: ThemeId; reduce: boolean; solid: boolean | null; behind: boolean };
const DEFAULTS: Prefs = { theme: DEFAULT_THEME, reduce: false, solid: null, behind: false };
const KEY = "north-appearance";

export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULTS;
  try {
    const j = JSON.parse(raw) as Partial<Prefs>;
    return {
      theme: THEMES.some((t) => t.id === j.theme) ? (j.theme as ThemeId) : DEFAULT_THEME,
      reduce: j.reduce === true,
      solid: typeof j.solid === "boolean" ? j.solid : null,
      behind: j.behind === true,
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
  /** True when motion is off, from the Reduce motion choice or the device's own setting. */
  reduced: boolean;
  /** The device asks for less motion: the choice can't turn it back on. */
  osReduced: boolean;
  setReduce(v: boolean): void;
  solid: boolean;
  setSolid(v: boolean): void;
  behind: boolean;
  setBehind(v: boolean): void;
};
const Ctx = createContext<Appearance | null>(null);

export function useAppearance(): Appearance {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppearance must be used inside AppearanceProvider");
  return v;
}

/** The root of every screen: carries the theme and the display choices as plain attributes and classes. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);
  const osReduced = useMedia("(prefers-reduced-motion: reduce)");
  const osSolid = useMedia("(prefers-reduced-transparency: reduce)");
  const reduced = prefs.reduce || osReduced;
  const solid = prefs.solid ?? osSolid;

  const setTheme = useCallback((theme: ThemeId) => write({ ...snapshot(), theme }), []);
  const setReduce = useCallback((reduce: boolean) => write({ ...snapshot(), reduce }), []);
  const setSolid = useCallback((s: boolean) => write({ ...snapshot(), solid: s }), []);
  const setBehind = useCallback((behind: boolean) => write({ ...snapshot(), behind }), []);

  const value = useMemo<Appearance>(
    () => ({ theme: prefs.theme, setTheme, reduced, osReduced, setReduce, solid, setSolid, behind: prefs.behind, setBehind }),
    [prefs.theme, prefs.behind, reduced, osReduced, solid, setTheme, setReduce, setSolid, setBehind],
  );

  const themeName = THEMES.find((t) => t.id === prefs.theme)?.name ?? "Bloom";
  return (
    <Ctx.Provider value={value}>
      <div
        className={`north-app${solid ? " ng-solid" : ""}${reduced ? " ng-reduced" : ""}${prefs.behind ? " ng-has-bts" : ""}`}
        data-theme={prefs.theme}
        data-theme-name={themeName}
      >
        <div className="ng-landscape" aria-hidden="true" />
        {children}
        <div id="north-dialog-root" />
      </div>
    </Ctx.Provider>
  );
}
