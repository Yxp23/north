import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { formatMoney } from "@/lib/format";
import { getStore } from "@/lib/store";

// The live store's prices change, so the list is made when it is asked for, never ahead of time.
async function Products() {
  await connection();
  const products = await getStore().listProducts();
  return (
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
  );
}

export default function Shop() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Shop</h1>
      <div className="space-y-3">
        <Link href="/choose" className={btnPrimary}>Help me choose</Link>
        <Link href="/find" className={btnSecondary}>Find something</Link>
        <Link href="/reorder" className={btnSecondary}>Buy this again (photo)</Link>
      </div>
      <p className="text-lg">Or pick one thing to look at.</p>
      <Suspense fallback={<p role="status" className="text-xl">Loading the shop…</p>}>
        <Products />
      </Suspense>
    </div>
  );
}
