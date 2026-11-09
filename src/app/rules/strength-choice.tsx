"use client";
// Choosing Gentle, Firm or Locked: three big cards, each with an icon, a word, one plain line and one example. Used when making a rule
// and when changing one. The choice is a normal radio group, so a keyboard and a screen reader work as expected.
import { Bell, Clock, Lock, type LucideIcon } from "lucide-react";
import type { Strength } from "@/lib/guardian";
import { STRENGTH_COPY, type RuleKind } from "./strength-copy";

const ICON: Record<Strength, LucideIcon> = { gentle: Bell, firm: Clock, locked: Lock };
const TONE: Record<Strength, string> = { gentle: "n-chip-good", firm: "n-chip-wait", locked: "n-chip-stop" };
const ORDER: Strength[] = ["gentle", "firm", "locked"];

export function StrengthChoice({
  name, kind, value, onChange, minStrength, suggested,
}: {
  name: string;
  kind: RuleKind;
  value: Strength | undefined;
  onChange(s: Strength): void;
  /** A new rule can't be weaker than the rule you have now. Weaker ones are shown but can't be picked. */
  minStrength?: Strength;
  suggested?: Strength;
}) {
  const min = minStrength ? ORDER.indexOf(minStrength) : 0;
  return (
    <div className="rs-list" role="radiogroup" aria-label="How strong should it be?">
      {ORDER.map((s, idx) => {
        const c = STRENGTH_COPY[s];
        const Icon = ICON[s];
        const disabled = idx < min;
        const checked = value === s;
        return (
          <label key={s} className={`rs-opt${checked ? " rs-on" : ""}${disabled ? " rs-off" : ""}`}>
            <input type="radio" name={name} checked={checked} disabled={disabled} onChange={() => onChange(s)} />
            <span className="rs-body">
              <span className={`n-chip ${TONE[s]}`}><Icon aria-hidden="true" />{c.title}{suggested === s ? " · matches your words" : ""}</span>
              <span className="rs-line">{c.line}</span>
              <span className="rs-ex"><b>For example:</b> {c.example(kind)}</span>
              {disabled && <span className="rs-note">This would be weaker than your rule now.</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
