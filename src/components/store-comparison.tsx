// "Where to buy": every in-stock store for a product, cheapest first. The cheapest is the one you pay, and it says how
// much you save compared with the most expensive store. The seller shows as its web address, not a brand logo.
import { compareStores } from "@/lib/store/compare";
import type { StoreOffer } from "@/lib/store/types";
import { formatMoney } from "@/lib/format";
import { card } from "./classes";

export function StoreComparison({ offers, live }: { offers?: StoreOffer[]; live?: boolean }) {
  const { rows, saveCents, hiddenCount } = compareStores(offers ?? []);
  return (
    <section aria-labelledby="stores-heading" className={`${card} space-y-3`}>
      <h2 id="stores-heading" className="text-2xl font-bold">Where to buy</h2>
      {live === false && <p className="rounded-xl bg-warn-bg p-3 text-warn-ink">This is a saved price. I could not reach the stores just now.</p>}
      {rows.length === 0 ? (
        <p className="text-lg">I only have one price for this one.</p>
      ) : (
        <>
          {saveCents > 0 && (
            <p className="rounded-xl bg-good-bg p-3 text-xl font-semibold text-good-ink">You save {formatMoney(saveCents)} at the cheapest store.</p>
          )}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.domain} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 p-3 ${r.youPay ? "border-accent" : "border-line"}`}>
                <span className="break-all text-lg">{r.domain}</span>
                <span className="text-right">
                  <span className="block text-xl font-bold">{formatMoney(r.cents)}</span>
                  <span className={`block text-base ${r.youPay ? "font-semibold text-accent" : ""}`}>{r.youPay ? "You pay this" : `${formatMoney(r.moreCents)} more`}</span>
                </span>
              </li>
            ))}
          </ul>
          {hiddenCount ? <p className="text-base">And {hiddenCount} more {hiddenCount === 1 ? "store" : "stores"}, all costing more.</p> : null}
        </>
      )}
      <p className="text-base">This is a practice shop. Your test PayPal pays, and nothing is sent to you.</p>
    </section>
  );
}
