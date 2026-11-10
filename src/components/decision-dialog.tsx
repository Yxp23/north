"use client";
// The Guardian's answer as a dialog: a bottom sheet on phones, a centred dialog on laptops. Six looks (Approved, Wait, Saved for later,
// Stopped, Scam stopped, Assistant stopped), each with an icon AND a word in the fixed status colours. The words about WHY are the Guardian's
// own; the prices and receipt numbers come from the store and PayPal. Nothing here can approve anything: it only shows what was decided.
import { Bot, Check, Clock, Hand, ShieldAlert, Bookmark, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Dialog } from "@/components/shell/dialog";
import { SpeakButton } from "@/components/shell/speak";
import type { DecisionView, IconKey } from "@/lib/ui/decision-view";

const ICONS: Record<IconKey, LucideIcon> = { check: Check, clock: Clock, bookmark: Bookmark, hand: Hand, "shield-alert": ShieldAlert, bot: Bot };
const TONE = { good: "n-chip-good", wait: "n-chip-wait", stop: "n-chip-stop" } as const;

export function StatusBadge({ view }: { view: Pick<DecisionView, "tone" | "icon" | "word"> }) {
  const Icon = ICONS[view.icon];
  return (
    <p className={`gd-badge ${TONE[view.tone]}`}>
      <Icon aria-hidden="true" />
      {view.word}
    </p>
  );
}

/** One row of "what this was about": a label and a value (a price, a seller, a receipt number). */
export function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="ng-review-row">
      <span>{label}</span>
      <strong className={mono ? "bts-id" : undefined}>{children}</strong>
    </div>
  );
}

export function DecisionDialog({
  view, title, reason, hear, onClose, children, dismissable = true, wide = false,
}: {
  view: Pick<DecisionView, "tone" | "icon" | "word" | "title" | "reason">;
  title?: string;
  reason?: string;
  /** The sentence for "Hear this". Defaults to the title and the reason. */
  hear?: string;
  onClose(): void;
  children?: ReactNode;
  dismissable?: boolean;
  wide?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => void heading.current?.focus({ preventScroll: true }), []);
  const t = title ?? view.title;
  const r = reason ?? view.reason;
  return (
    <Dialog
      label={`${view.word}. ${t}`} onClose={onClose} dismissable={dismissable} wide={wide}
      // The answer stays at the top, outside the scrolling part: it is never lost, and nothing can scroll under it.
      pinned={
        <div className="gd-pin">
          <StatusBadge view={view} />
          <h2 ref={heading} tabIndex={-1} style={{ outline: "none" }}>{t}</h2>
          {r && <p className="gd-reason">{r}</p>}
          <div className="gd-hear"><SpeakButton text={hear ?? `${view.word}. ${t}. ${r ?? ""}`} /></div>
        </div>
      }
    >
      {children}
    </Dialog>
  );
}
