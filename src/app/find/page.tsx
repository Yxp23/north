import { connection } from "next/server";
import { Suspense } from "react";
import { getStore } from "@/lib/store";
import { FindIt } from "./find-it";
import { ProductGrid } from "./product-grid";

export const metadata = { title: "Find" };

// The live store's prices change, so the list is made when it is asked for, never ahead of time.
async function Products() {
  await connection();
  const products = await getStore().listProducts();
  return <ProductGrid products={products.map((p) => ({ id: p.id, name: p.name, category: p.category, priceCents: p.priceCents, imageUrl: p.imageUrl }))} />;
}

export default function FindPage() {
  return (
    <div className="n-stack" style={{ gap: 34 }}>
      <FindIt />
      <section aria-labelledby="pick-h" className="n-stack">
        <h2 id="pick-h">Or look around</h2>
        <Suspense fallback={<p role="status" className="n-note n-note-quiet">Getting the shop. One moment.</p>}>
          <Products />
        </Suspense>
      </section>
    </div>
  );
}
