// A product with its picture, name and price, for lists of finds, picks and matches. The price is the store's own number.
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import type { ShelfItem } from "@/lib/finder/types";
import { card } from "./classes";

export function ProductCard({ item, children }: { item: ShelfItem; children?: ReactNode }) {
  return (
    <div className={`${card} space-y-3`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.name} className="h-40 w-full rounded-xl bg-white object-contain" />
      <p className="text-xl font-semibold">{item.name}</p>
      <p className="text-3xl font-bold">{formatMoney(item.priceCents)}</p>
      <p className="break-all text-base">Cheapest at {item.domain}{item.storeCount > 1 ? `, ${item.storeCount} stores in all` : ""}</p>
      {children}
    </div>
  );
}
