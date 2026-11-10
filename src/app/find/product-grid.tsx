"use client";
import { Photo } from "@/components/photo";
import Link from "next/link";
import { card } from "@/components/classes";
import { useMask } from "@/components/shell/mask";
import { formatMoney } from "@/lib/format";

export function ProductGrid({ products }: { products: { id: string; name: string; category: string; priceCents: number; imageUrl: string }[] }) {
  const m = useMask();
  return (
    <ul className="n-grid-auto">
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/shop/${p.id}`} className={`${card} n-tilecard`} style={{ textDecoration: "none", color: "inherit" }}>
            <Photo src={p.imageUrl} className="n-photo n-photo-resp" />
            <span className="n-t-lg">{m.item(p.name, p.category)}</span>
            <span className="n-t-xl" style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(p.priceCents)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
