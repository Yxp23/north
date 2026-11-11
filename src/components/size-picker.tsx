"use client";
// "Choose your size": big, easy buttons (S M L, 7 8 9 10, ring sizes), one decision. The labels are the store's own. A size the store has none of is
// shown but can't be picked. If the person has a usual size and this product has it, it is preselected by the caller and said plainly.
import { Check } from "lucide-react";
import { useId } from "react";

export function SizePicker({ sizes, soldOut = [], value, onChange, usual, kindWord }: {
  sizes: string[];
  soldOut?: string[];
  value: string | null;
  onChange(size: string): void;
  /** Your usual size, when this product has it. */
  usual?: string | null;
  /** "shoe", "clothing" or "ring": for the heading's help text. */
  kindWord?: string;
}) {
  const name = useId();
  // The store's own order, with the sizes it has none of in their place.
  const all = [...sizes.map((s) => ({ s, out: false })), ...soldOut.map((s) => ({ s, out: true }))];
  return (
    <fieldset className="sz">
      <legend className="sz-legend">Choose your size</legend>
      {usual && value === usual && <p className="sz-usual"><Check aria-hidden="true" />Your usual size: {usual}</p>}
      <div className="sz-grid" role="radiogroup" aria-label={`Choose your ${kindWord ? `${kindWord} ` : ""}size`}>
        {all.map(({ s, out }) => (
          <label key={s} className={`sz-opt${out ? " sz-out" : ""}`}>
            <input type="radio" name={name} value={s} checked={value === s} disabled={out} onChange={() => onChange(s)} />
            <span>{s}{out && <span className="ng-vh"> (sold out)</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
