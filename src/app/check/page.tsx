import { Suspense } from "react";
import { formatMoney } from "@/lib/format";
import { getStore } from "@/lib/store";
import { CheckDeal } from "./check-deal";

// Next 16 wants request data (searchParams) read inside <Suspense>.
// "?product=ID" fills the box with that listing's ad, so the demo needs no typing.
async function Inner({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product: id } = await searchParams;
  const product = id ? await getStore().getProduct(id) : null;
  const prefill = product ? `${product.name} for ${formatMoney(product.priceCents)}${product.sellerDomain ? ` at https://${product.sellerDomain}/deal` : ""}` : "";
  return <CheckDeal prefill={prefill} />;
}

export default function CheckPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="text-xl">Loading…</p>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}
