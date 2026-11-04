import Link from "next/link";
import { card } from "@/components/classes";
import { formatMoney } from "@/lib/format";
import { getStore } from "@/lib/store";

export default async function Shop() {
  const products = await getStore().listProducts();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Shop</h1>
      <p className="text-lg">Pick one thing to look at.</p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {products.map((p) => (
          <li key={p.id}>
            <Link href={`/shop/${p.id}`} className={`${card} flex h-full flex-col items-center gap-3 text-center hover:border-accent`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt="" className="h-40 w-full rounded-xl bg-white object-contain" />
              <span className="text-lg font-semibold">{p.name}</span>
              <span className="text-2xl font-bold">{formatMoney(p.priceCents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
