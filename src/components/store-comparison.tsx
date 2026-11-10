"use client";
// "Where to buy": every in-stock store for a product, cheapest first. The cheapest is the one you pay, and it says how
// much you save compared with the most expensive store. The seller shows as its web address, not a brand logo.
import { Check, TriangleAlert } from "lucide-react";
import { compareStores } from "@/lib/store/compare";
import type { StoreOffer } from "@/lib/store/types";
import { formatMoney } from "@/lib/format";
import { card } from "./classes";
import { useMask } from "./shell/mask";

export function StoreComparison({ offers, live }: { offers?: StoreOffer[]; live?: boolean }) {
  const m = useMask();
  const { rows, saveCents, hiddenCount } = compareStores(offers ?? []);
  return (
    <section aria-labelledby="stores-heading" className={`${card} n-stack`}>
      <h2 id="stores-heading">Where to buy</h2>
      {live === false && <p className="n-note n-note-wait"><TriangleAlert aria-hidden="true" /><span>This is a saved price. I could not reach the stores just now.</span></p>}
      {rows.length === 0 ? (
        <p>I only have one price for this one.</p>
      ) : (
        <>
          {saveCents > 0 && (
            <p className="n-note n-note-good"><Check aria-hidden="true" /><span className="n-t-xl">You save {formatMoney(saveCents)} at the cheapest store.</span></p>
          )}
          <ul className="n-stack n-gap-2">
            {rows.map((r) => (
              <li key={r.domain} className={`n-between n-offer${r.youPay ? " n-offer-pay" : ""}`}>
                <span className="n-break n-t-lg">{m.store(r.domain)}</span>
                <span className="n-right">
                  <span className="n-block n-t-xl n-num">{formatMoney(r.cents)}</span>
                  <span className={`n-block n-t-base ${r.youPay ? "n-pay" : "n-muted"}`}>{r.youPay ? "You pay this" : `${formatMoney(r.moreCents)} more`}</span>
                </span>
              </li>
            ))}
          </ul>
          {hiddenCount ? <p>And {hiddenCount} more {hiddenCount === 1 ? "store" : "stores"}, all costing more.</p> : null}
        </>
      )}
      <p className="n-muted">This is a practice shop. Your test PayPal pays, and nothing is sent to you.</p>
    </section>
  );
}
