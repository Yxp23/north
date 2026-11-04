import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getStore } from "@/lib/store";
import { BuyScreen } from "./buy-screen";

// Next 16 wants request data (params) read inside <Suspense>.
async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getStore().getProduct(id);
  if (!product) notFound();
  return <BuyScreen product={product} />;
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="text-xl">Loading…</p>}>
      <Product params={params} />
    </Suspense>
  );
}
