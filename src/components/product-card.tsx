"use client";
// A product with its picture, name and price, for lists of finds, picks and matches. The price is the store's own number.
// "Compare stores" opens the same store comparison as the product page (every in-stock store, cheapest first). It is read from the store when opened.
import { Photo } from "./photo";
import { useEffect, useState, type ReactNode } from "react";
import { Disclosure } from "@/components/disclosure";
import { RealThingsLine } from "@/components/money";
import { StoreComparison } from "@/components/store-comparison";
import { formatMoney } from "@/lib/format";
import type { ShelfItem } from "@/lib/finder/types";
import type { StoreProduct } from "@/lib/store";
import { card } from "./classes";
import { useMask } from "./shell/mask";

function Compare({ id }: { id: string }) {
  const [product, setProduct] = useState<StoreProduct | null | "error">(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/products?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setProduct(j.product))
      .catch(() => alive && setProduct("error"));
    return () => { alive = false; };
  }, [id]);
  if (product === null) return <p role="status" className="n-note n-note-quiet"><span>Getting the stores. One moment.</span></p>;
  if (product === "error") return <p role="alert" className="n-note n-note-stop"><span>I could not get the stores just now. Nothing was changed.</span></p>;
  return <StoreComparison offers={product.offers} live={product.live} />;
}

export function ProductCard({ item, children, openCompare = false, compare = true }: { item: ShelfItem; children?: ReactNode; openCompare?: boolean; compare?: boolean }) {
  const m = useMask();
  const name = m.item(item.name, item.category);
  return (
    <div className={`${card} n-stack`}>
      <Photo src={item.imageUrl} alt={name} className="n-photo" />
      <p className="n-t-xl">{name}</p>
      <p className="n-price">{formatMoney(item.priceCents)}</p>
      <RealThingsLine cents={item.priceCents} className="ng-real" />
      <p className="n-break n-muted">Cheapest at {m.store(item.domain)}{item.storeCount > 1 ? `, ${item.storeCount} stores in all` : ""}</p>
      {compare && item.storeCount > 1 && (
        <Disclosure summary="Compare stores" defaultOpen={openCompare}>
          <Compare id={item.id} />
        </Disclosure>
      )}
      {children}
    </div>
  );
}
