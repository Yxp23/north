"use client";
import Link from "next/link";
import { card } from "@/components/classes";
import { useMask } from "@/components/shell/mask";
import { formatMoney } from "@/lib/format";

export function ProductGrid({ products }: { products: { id: string; name: string; category: string; priceCents: number; imageUrl: string }[] }) {
  const m = useMask();
  return (
    <ul className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/shop/${p.id}`} className={`${card} flex h-full flex-col items-center gap-3 text-center`} style={{ textDecoration: "none", color: "inherit" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imageUrl} alt="" className="h-40 w-full rounded-xl bg-white object-contain" />
            <span className="text-lg">{m.item(p.name, p.category)}</span>
            <span className="text-2xl" style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(p.priceCents)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
