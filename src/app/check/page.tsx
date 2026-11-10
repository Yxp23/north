import { connection } from "next/server";
import { Suspense } from "react";
import { formatMoney } from "@/lib/format";
import { isCheckableListing } from "@/lib/dealcheck/listing";
import { getStore } from "@/lib/store";
import { CheckDeal } from "./check-deal";

// Next 16 wants request data (searchParams) read inside <Suspense>.
// "?product=ID" fills the box with that listing's ad, so the demo needs no typing.
async function Inner({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product: id } = await searchParams;
  await connection(); // the live store's price changes: read it for this request
  const product = id ? await getStore().getProduct(id) : null;
  const prefill = product ? `${product.name} for ${formatMoney(product.priceCents)}${product.sellerDomain ? ` at https://${product.sellerDomain}/deal` : ""}` : "";
  // A live product is checked from its own stores and price history. A made-up demo listing keeps the pasted-ad check (that is where its trick is caught).
  const listing = product && isCheckableListing(product) ? { id: product.id, name: product.name, stores: product.offers!.length } : null;
  return <CheckDeal prefill={listing ? "" : prefill} listing={listing} />;
}

export default function CheckPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  return (
    <Suspense fallback={<p role="status" className="n-note n-note-quiet">Getting this page. One moment.</p>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}
