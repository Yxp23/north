"use client";
// The frame around every screen: brand, the four tabs (a glass capsule on laptops, a bottom tab bar on phones), Appearance, Help,
// the Ask North bar, and the footer. It also hosts Help, Ask North and the Behind the scenes panel.
import { ArrowUp, Bookmark, Bot, CircleHelp, Eye, FlaskConical, House, LogOut, Palette, Route, Search, UserRound, Wallet, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AskNorth } from "@/app/ask-north";
import { navFrames, MOTION } from "@/lib/ui/springs";
import { MODES, THEMES, useAppearance } from "./appearance";
import { BehindTheScenes } from "./behind-the-scenes";
import { Dialog } from "./dialog";
import { MotionLayer } from "./motion-layer";
import { SpeakButton } from "./speak";
import { StoreLiveContext } from "./store-live";

type Tab = { href: string; label: string; Icon: LucideIcon; match: RegExp };
const TABS: Tab[] = [
  { href: "/", label: "Home", Icon: House, match: /^\/$/ },
  { href: "/find", label: "Find", Icon: Search, match: /^\/(find|shop|choose|reorder|check)(\/|$)/ },
  { href: "/saved", label: "Saved", Icon: Bookmark, match: /^\/saved(\/|$)/ },
  { href: "/money", label: "Money", Icon: Wallet, match: /^\/(money|rules|payments|connect)(\/|$)/ },
];
export const activeTab = (path: string) => TABS.findIndex((t) => t.match.test(path));

function ShellNav({ path }: { path: string }) {
  const idx = activeTab(path);
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const selRef = useRef<HTMLSpanElement>(null);
  const last = useRef<{ idx: number; x: number } | null>(null);
  // Set when the pill was let go on a tab: it is already there and bouncing, so the route change that follows must not restart it.
  const snapped = useRef<number | null>(null);
  const drag = useRef<{ x0: number; pill0: number; moved: boolean; id: number } | null>(null);
  const justDragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  const { reduced } = useAppearance();

  useLayoutEffect(() => {
    const el = selRef.current;
    if (!el) return;
    const place = (animate: boolean) => {
      if (animate && snapped.current === idx) {
        snapped.current = null;
        return;
      }
      snapped.current = null;
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = idx < 0 ? "0" : "";
      const x = el.offsetWidth * Math.max(idx, 0);
      el.style.transform = `translateX(${x}px)`;
      if (animate && idx >= 0 && last.current && last.current.idx !== idx && !reduced && typeof el.animate === "function") {
        el.animate(navFrames(last.current.x, x), { duration: MOTION.nav.durationMs, easing: "linear", fill: "none" });
      }
      last.current = { idx, x };
    };
    place(true);
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [idx, reduced]);

  // The selected pill can be dragged to another tab. It follows the finger, then snaps to the nearest tab with the same bounce as a tap and
  // goes there. The tabs are still real links (a tap, the keyboard and a screen reader work exactly as before): dragging is only an extra.
  function down(e: React.PointerEvent<HTMLElement>) {
    const pill = selRef.current;
    if (idx < 0 || !pill || (e.pointerType === "mouse" && e.button !== 0)) return;
    const r = pill.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right) return; // only a press on the selected pill starts a drag
    drag.current = { x0: e.clientX, pill0: last.current?.x ?? pill.offsetWidth * idx, moved: false, id: e.pointerId };
  }
  function move(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    const pill = selRef.current;
    const nav = navRef.current;
    if (!d || !pill || !nav || d.id !== e.pointerId) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x0) < 6) return;
      d.moved = true;
      nav.setPointerCapture(e.pointerId);
      pill.getAnimations().forEach((a) => a.cancel());
      setDragging(true);
    }
    const w = pill.offsetWidth;
    const x = Math.min(w * (TABS.length - 1), Math.max(0, d.pill0 + e.clientX - d.x0));
    pill.style.transform = `translateX(${x}px)`;
    if (last.current) last.current.x = x;
    // The bright rim of the whole capsule leans toward the pill while it is dragged.
    nav.style.setProperty("--light-x", `${((x + w / 2) / nav.clientWidth) * 100}%`);
  }
  function up(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    const pill = selRef.current;
    const nav = navRef.current;
    drag.current = null;
    if (!d || !d.moved || !pill || !nav) return;
    setDragging(false);
    nav.style.removeProperty("--light-x");
    justDragged.current = true;
    window.setTimeout(() => (justDragged.current = false), 0); // the click that follows a drag must not open a tab twice
    if (e.type === "pointercancel") return;
    const w = pill.offsetWidth;
    const from = last.current?.x ?? 0;
    const k = Math.min(TABS.length - 1, Math.max(0, Math.round(from / w)));
    const to = k * w;
    pill.style.transform = `translateX(${to}px)`;
    if (!reduced && typeof pill.animate === "function") pill.animate(navFrames(from, to), { duration: MOTION.nav.durationMs, easing: "linear", fill: "none" });
    last.current = { idx: k, x: to };
    if (k !== idx) {
      snapped.current = k;
      router.push(TABS[k].href);
    }
  }

  return (
    <nav
      ref={navRef} className={`ng-nav ng-glass${dragging ? " ng-nav-drag" : ""}`} aria-label="North navigation"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onClickCapture={(e) => { if (justDragged.current) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <span ref={selRef} className="ng-nav-selector" aria-hidden="true" />
      {TABS.map((t, i) => (
        <Link key={t.href} href={t.href} aria-current={i === idx ? "page" : undefined} draggable={false}>
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
      <fieldset className="ng-mode">
        <legend>Light or dark</legend>
        {MODES.map((m) => (
          <label key={m.id} className="ng-mode-opt">
            <input
              type="radio" name="ng-mode" checked={a.mode === m.id}
              onChange={() => { a.setMode(m.id); setSaid(`${m.label} selected. Your menu and your spending rules are unchanged.`); }}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </fieldset>
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
  "North helps you shop. You set the rules, and North follows them. Before any payment, North checks the item, the seller and the total against your rules. Making a rule stricter starts right away. Making it weaker starts tomorrow.";

// Moving to another page: the page area fades in and rises a few pixels, over about 0.2 seconds (nothing slower than 250ms). Things that
// appear later on the same page (results arriving, an answer) ease in the same short way, once. Nothing loops. Off with reduced motion.
const REVEAL = ".ng-hero, .ng-page-title, .ng-askbox, .ng-quick, .n-card, .ng-money, .ng-saved, .ng-trust, .n-note, .ng-section, .n-reveal";
const PAGE_MS = 220;
const EASE = "cubic-bezier(0.22, 0.7, 0.2, 1)";
function PageMotion({ path }: { path: string }) {
  const { reduced } = useAppearance();
  useEffect(() => {
    if (reduced) return;
    const main = document.getElementById("main");
    if (!main || typeof main.animate !== "function") return;
    const t0 = performance.now();
    main.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: PAGE_MS, easing: EASE });
    let raf = 0;
    const seen = new WeakSet<Element>(); // not an attribute: React owns the DOM attributes
    const run = () => {
      raf = 0;
      const covered = performance.now() - t0 < PAGE_MS + 60; // already carried in by the page's own fade
      main.querySelectorAll<HTMLElement>(REVEAL).forEach((el) => {
        if (seen.has(el) || el.parentElement?.closest(REVEAL)) return;
        seen.add(el);
        if (covered || el.getBoundingClientRect().top > window.innerHeight * 1.5) return;
        el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: PAGE_MS, easing: EASE, fill: "backwards" });
      });
    };
    const schedule = () => void (raf || (raf = requestAnimationFrame(run)));
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [path, reduced]);
  return null;
}

/** The settings menu: everything that is about North itself rather than your money. */
function SettingsMenu({ open, onClose, onAppearance, onHelp, triggerRef, demo, onLogout, loggingOut }: {
  open: boolean; onClose(): void; onAppearance(): void; onHelp(): void; triggerRef: React.RefObject<HTMLButtonElement | null>; demo: boolean; onLogout(): void; loggingOut: boolean;
}) {
  const a = useAppearance();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !triggerRef.current?.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onClose, triggerRef]);
  if (!open) return null;
  return (
    <div ref={ref} id="ng-menu" className="ng-menu" role="group" aria-label="Settings and help">
      <ul>
        <li><button type="button" onClick={onAppearance}><Palette aria-hidden="true" />Appearance</button></li>
        <li><Link href="/assistants" onClick={onClose}><Bot aria-hidden="true" />AI assistants<small>Advanced</small></Link></li>
        <li className="ng-bts-only"><button type="button" aria-pressed={a.behind} onClick={() => { a.setBehind(!a.behind); onClose(); }}><Eye aria-hidden="true" />Behind the scenes<small>{a.behind ? "On" : "Off"}</small></button></li>
        <li><button type="button" onClick={onHelp}><CircleHelp aria-hidden="true" />Help</button></li>
        <li><Link href="/how-it-works" onClick={onClose}><Route aria-hidden="true" />How North works</Link></li>
        {demo && <li><Link href="/demo" onClick={onClose}><FlaskConical aria-hidden="true" />Demo tools<small>Practice only</small></Link></li>}
        <li><button type="button" onClick={onLogout} disabled={loggingOut}><LogOut aria-hidden="true" />{loggingOut ? "Logging out…" : "Log out"}</button></li>
      </ul>
    </div>
  );
}

export function AppShell({ children, signedIn = true }: { children: ReactNode; signedIn?: boolean }) {
  const path = usePathname() ?? "/";
  // The login page, and any page seen by someone who is not signed in (the landing page, How North works), get the plain header.
  const onLogin = path === "/login" || !signedIn;
  const [menuOpen, setMenuOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [ask, setAsk] = useState(false);
  const [demo, setDemo] = useState(false);
  const [storeLive, setStoreLive] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const closeAppearance = useCallback(() => setAppearanceOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Demo tools only show for the practice account in demo mode (the server says so).
  useEffect(() => {
    if (onLogin) return;
    let alive = true;
    fetch("/api/summary", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!alive) return; setDemo(j?.demoMode === true); setStoreLive(j?.storeLive === true); }).catch(() => undefined);
    return () => { alive = false; };
  }, [onLogin]);

  // Going to another screen closes whatever was open.
  const [seen, setSeen] = useState(path);
  if (seen !== path) {
    setSeen(path);
    setHelp(false);
    setAsk(false);
    setMenuOpen(false);
    setAppearanceOpen(false);
  }

  async function logOut() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    // A full page load on purpose: after logging out, nothing from the old session should stay on the page. Logged out, "/" is the front page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <StoreLiveContext.Provider value={storeLive}>
      <MotionLayer />
      <PageMotion path={path} />
      <div className="ng-content">
        <a href="#main" className="ng-skip">Skip to the page</a>
        <header className="ng-top">
          <Link href="/" className="ng-brand" aria-label="North, home">
            <span className="ng-brand-star" aria-hidden="true">✦</span>north
          </Link>
          {!onLogin && <ShellNav path={path} />}
          <div className="ng-top-actions">
            {onLogin ? (
              <button type="button" className="ng-top-help ng-glass" onClick={() => setAppearanceOpen((v) => !v)} aria-expanded={appearanceOpen} aria-controls="ng-appearance">
                <Palette aria-hidden="true" />Appearance
              </button>
            ) : (
              <>
              <button type="button" className="ng-top-help ng-glass" onClick={() => { setMenuOpen(false); setHelp(true); }}>
                <CircleHelp aria-hidden="true" /><span className="ng-help-word">Help</span>
              </button>
              <button
                ref={menuBtn} type="button" className="ng-top-help ng-glass" aria-expanded={menuOpen} aria-controls="ng-menu" aria-haspopup="true"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="ng-avatar" aria-hidden="true"><UserRound /></span>Menu
              </button>
              </>
            )}
          </div>
        </header>

        <div className="ng-pages">
          <main id="main" className="n-main" tabIndex={-1}>{children}</main>
        </div>

        {!onLogin && !["/", "/find", "/check", "/welcome"].includes(path) && (
          <button type="button" className="ng-ask ng-glass" onClick={() => { setMenuOpen(false); setAsk(true); }}>
            <span aria-hidden="true">✦</span>
            <span>Ask North a question</span>
            <ArrowUp aria-hidden="true" />
          </button>
        )}

        <footer className="ng-laptop-foot">
          <span>You set the rules. You can override them.</span>
          <span className="ng-foot-links">
            <Link href="/how-it-works" className="ng-foot-link">How North works</Link>
            <button type="button" className="ng-foot-link" onClick={() => setHelp(true)}>Help is always here</button>
          </span>
        </footer>
      </div>

      <SettingsMenu
        open={menuOpen && !onLogin} onClose={closeMenu} triggerRef={menuBtn} demo={demo} onLogout={logOut} loggingOut={loggingOut}
        onAppearance={() => { setMenuOpen(false); setAppearanceOpen(true); }} onHelp={() => { setMenuOpen(false); setHelp(true); }}
      />
      <AppearancePanel open={appearanceOpen} onClose={closeAppearance} triggerRef={menuBtn} />
      <BehindTheScenes />

      {help && (
        <Dialog label="Help" onClose={() => setHelp(false)}>
          <h2>Help, when you need it.</h2>
          <p>North helps you shop. You set the rules, and North follows them.</p>
          <p>Before any payment, North checks the item, the seller and the total against your rules.</p>
          <p>Making a rule stricter starts right away. Making it weaker starts tomorrow, so you can change your mind.</p>
          <div style={{ margin: "0 0 14px" }}><SpeakButton text={HELP_TEXT} /></div>
          <Link href="/how-it-works" className="n-btn n-btn-secondary">See how North works</Link>
          <button type="button" className="n-btn n-btn-primary" data-autofocus onClick={() => setHelp(false)}>Back to North</button>
        </Dialog>
      )}
      {ask && (
        <Dialog label="Ask North" wide onClose={() => setAsk(false)}>
          <AskNorth onLeave={() => setAsk(false)} />
        </Dialog>
      )}
    </StoreLiveContext.Provider>
  );
}
