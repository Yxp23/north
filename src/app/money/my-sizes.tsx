"use client";
// Money > My sizes: the shoe and clothing size North remembers to preselect ("Your usual size: 9"). It lives in this browser only, and it can never buy
// or approve anything: the size that is bought is always the one picked on the product.
import { Ruler, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { forgetSize, mySizesServerSnapshot, mySizesSnapshot, subscribeMySizes } from "@/lib/ui/my-sizes";

const ROWS = [{ kind: "shoes", label: "Shoe size" }, { kind: "clothes", label: "Clothing size" }] as const;

export function MySizes() {
  const saved = useSyncExternalStore(subscribeMySizes, mySizesSnapshot, mySizesServerSnapshot);
  const rows = ROWS.filter((r) => saved[r.kind]);
  return (
    <section aria-labelledby="sizes-h" className="n-stack">
      <h2 id="sizes-h">My sizes</h2>
      {rows.length === 0 ? (
        <p>No sizes saved yet. When you pick a shoe or clothing size, North can remember it for next time.</p>
      ) : (
        <>
          <p>North preselects these for you. You can always pick a different size.</p>
          <ul className="ms-list">
            {rows.map((r) => (
              <li key={r.kind}>
                <span><Ruler aria-hidden="true" size={18} style={{ display: "inline", verticalAlign: "-3px", marginRight: 8 }} />{r.label}: <strong>{saved[r.kind]}</strong></span>
                <button type="button" className="n-btn n-btn-quiet n-btn-auto" onClick={() => forgetSize(r.kind)} aria-label={`Forget my ${r.label.toLowerCase()}, ${saved[r.kind]}`}><X aria-hidden="true" />Forget</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="n-muted">Saved on this device only.</p>
    </section>
  );
}
