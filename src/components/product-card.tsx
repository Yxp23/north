// A product with its picture, name and price, for lists of finds, picks and matches. The price is the store's own number.
import type { ReactNode } from "react";
import { RealThingsLine } from "@/components/money";
import { formatMoney } from "@/lib/format";
import type { ShelfItem } from "@/lib/finder/types";
import { card } from "./classes";

export function ProductCard({ item, children }: { item: ShelfItem; children?: ReactNode }) {
  return (
    <div className={`${card} n-stack`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.name} className="h-40 w-full rounded-xl bg-white object-contain" />
      <p className="text-xl">{item.name}</p>
      <p style={{ fontSize: 30, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>{formatMoney(item.priceCents)}</p>
      <RealThingsLine cents={item.priceCents} className="ng-real" />
      <p className="break-all" style={{ color: "var(--n-muted)" }}>Cheapest at {item.domain}{item.storeCount > 1 ? `, ${item.storeCount} stores in all` : ""}</p>
      {children}
    </div>
  );
}
