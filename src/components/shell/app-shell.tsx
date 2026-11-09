"use client";
// The frame around every screen: brand, the four tabs (a glass capsule on laptops, a bottom tab bar on phones), Appearance, Help,
// the Ask North bar, and the footer. It also hosts Help, Ask North and the Behind the scenes panel.
import { ArrowUp, Bookmark, CircleHelp, Eye, House, Palette, Search, Wallet, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AskNorth } from "@/app/ask-north";
import { navFrames, MOTION } from "@/lib/ui/springs";
import { THEMES, useAppearance } from "./appearance";
import { BehindTheScenes } from "./behind-the-scenes";
import { Dialog } from "./dialog";
import { MotionLayer, shine } from "./motion-layer";
import { SpeakButton } from "./speak";

type Tab = { href: string; label: string; Icon: LucideIcon; match: RegExp };
const TABS: Tab[] = [
  { href: "/", label: "Home", Icon: House, match: /^\/$/ },
  { href: "/shop", label: "Shop", Icon: Search, match: /^\/(shop|find|choose|reorder|check)(\/|$)/ },
  { href: "/saved", label: "Saved", Icon: Bookmark, match: /^\/saved(\/|$)/ },
  { href: "/money", label: "My money", Icon: Wallet, match: /^\/(money|rules|payments|assistants|connect)(\/|$)/ },
];
export const activeTab = (path: string) => TABS.findIndex((t) => t.match.test(path));

function ShellNav({ path }: { path: string }) {
  const idx = activeTab(path);
  const navRef = useRef<HTMLElement>(null);
  const selRef = useRef<HTMLSpanElement>(null);
  const last = useRef<{ idx: number; x: number } | null>(null);
  const { reduced } = useAppearance();

  useLayoutEffect(() => {
    const el = selRef.current;
    if (!el) return;
    const place = (animate: boolean) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = idx < 0 ? "0" : "";
      const x = el.offsetWidth * Math.max(idx, 0);
      el.style.transform = `translateX(${x}px)`;
      if (animate && idx >= 0 && last.current && last.current.idx !== idx && !reduced && typeof el.animate === "function") {
        el.animate(navFrames(last.current.x, x), { duration: MOTION.nav.durationMs, easing: "linear", fill: "none" });
        shine(navRef.current);
      }
      last.current = { idx, x };
    };
    place(true);
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [idx, reduced]);

  return (
    <nav ref={navRef} className="ng-nav ng-glass" aria-label="North navigation">
      <span ref={selRef} className="ng-nav-selector" aria-hidden="true" />
      {TABS.map((t, i) => (
        <Link key={t.href} href={t.href} aria-current={i === idx ? "page" : undefined}>
          <t.Icon aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function AppearancePanel({ open, onClose, triggerRef }: { open: boolean; onClose(): void; triggerRef: React.RefObject<HTMLButtonElement | null> }) {
  const a = useAppearance();
  const [said, setSaid] = useState("");
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("[data-theme-pick][aria-pressed=true]")?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, triggerRef]);

  return (
    <aside ref={panelRef} id="ng-appearance" className="ng-controls" aria-label="Appearance" hidden={!open}>
      <h2>Appearance</h2>
      <button type="button" className="ng-appearance-close" aria-label="Close Appearance" onClick={() => { onClose(); triggerRef.current?.focus({ preventScroll: true }); }}>
        <X aria-hidden="true" />
      </button>
      <div className="ng-theme-list" role="group" aria-label="Choose a theme">
        {THEMES.map((t) => (
          <button
            key={t.id} type="button" className="ng-theme-choice" data-theme-pick={t.id} aria-pressed={a.theme === t.id}
            onClick={() => { a.setTheme(t.id); setSaid(`${t.name} theme selected. Your menu and your spending rules are unchanged.`); }}
          >
            <span className="ng-theme-disc" style={{ background: t.disc }} />
            <span>{t.name}<small>{t.note}</small></span>
          </button>
        ))}
      </div>
      <hr className="ng-controls-divider" />
      <label className="ng-check">
        <input type="checkbox" checked={a.reduced} disabled={a.osReduced} onChange={(e) => a.setReduce(e.target.checked)} />
        Reduce motion
      </label>
      {a.osReduced && <p className="ng-pref-note">Your device already asks for less motion.</p>}
      <label className="ng-check">
        <input type="checkbox" checked={a.solid} onChange={(e) => a.setSolid(e.target.checked)} />
        Use solid surfaces
      </label>
      <label className="ng-check ng-bts-only">
        <input type="checkbox" checked={a.behind} onChange={(e) => a.setBehind(e.target.checked)} />
        Show Behind the scenes
      </label>
      <p className="ng-pref-note" style={{ marginLeft: 0, marginTop: 10 }}>These only change how North looks. They never change your rules or your money.</p>
      <div className="ng-vh" aria-live="polite">{said}</div>
    </aside>
  );
}

const HELP_TEXT =
  "North helps you shop. You set the rules, and North follows them. Before any payment, the Money Guardian checks the item, the seller and the total against your rules. Making a rule stricter starts right away. Making it weaker takes one day.";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const onLogin = path === "/login";
  const a = useAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [ask, setAsk] = useState(false);
  const appearanceBtn = useRef<HTMLButtonElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const closeAppearance = useCallback(() => setAppearanceOpen(false), []);

  // Going to another screen closes whatever was open.
  const [seen, setSeen] = useState(path);
  if (seen !== path) {
    setSeen(path);
    setHelp(false);
    setAsk(false);
    setAppearanceOpen(false);
  }

  async function logOut() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    // A full page load on purpose: after logging out, nothing from the old session should stay on the page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <>
      <MotionLayer />
      <div className="ng-content">
        <a href="#main" className="ng-skip">Skip to the page</a>
        <header className="ng-top">
          <Link href="/" className="ng-brand" aria-label="North, home">
            <span className="ng-brand-star" aria-hidden="true">✦</span>north
          </Link>
          {!onLogin && <ShellNav path={path} />}
          <div className="ng-top-actions">
            <button
              ref={appearanceBtn} type="button" className="ng-top-help ng-glass" aria-expanded={appearanceOpen} aria-controls="ng-appearance"
              onClick={() => setAppearanceOpen((v) => !v)}
            >
              <Palette aria-hidden="true" />Appearance
            </button>
            {!onLogin && (
              <button type="button" className="ng-top-help ng-glass ng-bts-only" aria-pressed={a.behind} onClick={() => a.setBehind(!a.behind)}>
                <Eye aria-hidden="true" />Behind the scenes
              </button>
            )}
            <button type="button" className="ng-top-help ng-glass" onClick={() => { setAppearanceOpen(false); setHelp(true); }}>
              <CircleHelp aria-hidden="true" />Help
            </button>
          </div>
        </header>

        <div className="ng-pages">
          <main id="main" className="n-main" tabIndex={-1}>{children}</main>
        </div>

        {!onLogin && (
          <button type="button" className="ng-ask ng-glass" onClick={() => { setAppearanceOpen(false); setAsk(true); }}>
            <span aria-hidden="true">✦</span>
            <span>Ask North a question</span>
            <ArrowUp aria-hidden="true" />
          </button>
        )}

        <footer className="ng-laptop-foot">
          <span>You set the rules. You can override them.</span>
          <span className="ng-foot-links">
            {!onLogin && <Link href="/how-it-works">How North works</Link>}
            <button type="button" onClick={() => setHelp(true)}>Help is always here</button>
            {!onLogin && <button type="button" onClick={logOut} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</button>}
          </span>
        </footer>
      </div>

      <AppearancePanel open={appearanceOpen} onClose={closeAppearance} triggerRef={appearanceBtn} />
      <BehindTheScenes />

      {help && (
        <Dialog label="Help" onClose={() => setHelp(false)}>
          <h2>Help, when you need it.</h2>
          <p>North helps you shop. You set the rules, and North follows them.</p>
          <p>Before any payment, the Money Guardian checks the item, the seller and the total against your rules.</p>
          <p>Making a rule stricter starts right away. Making it weaker takes one day, so you can change your mind.</p>
          <div style={{ margin: "0 0 14px" }}><SpeakButton text={HELP_TEXT} /></div>
          <Link href="/how-it-works" className="n-btn n-btn-secondary">See how North works</Link>
          <button type="button" className="n-btn n-btn-primary" data-autofocus onClick={() => setHelp(false)}>Back to North</button>
        </Dialog>
      )}
      {ask && (
        <Dialog label="Ask North" wide onClose={() => setAsk(false)}>
          <AskNorth />
        </Dialog>
      )}
    </>
  );
}
