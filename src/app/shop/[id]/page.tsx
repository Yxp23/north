import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isDemoMode } from "@/lib/ledger/server";
import { getStore } from "@/lib/store";
import { BuyScreen } from "./buy-screen";

// Next 16 wants request data (params) read inside <Suspense>.
async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection(); // the live store's price changes: read it for this request, never ahead of time
  const product = await getStore().getProduct(id);
  if (!product) notFound();
  return <BuyScreen product={product} demoMode={isDemoMode()} />;
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="n-note n-note-quiet">Getting this item. One moment.</p>}>
      <Product params={params} />
    </Suspense>
  );
}
