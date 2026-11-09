import { authenticate } from "@/lib/auth/guard";
import { getStore } from "@/lib/store";

// The shop's products. `?id=...` gives one product with every in-stock store's price (read-only, from the store).
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const product = id.length <= 80 ? await getStore().getProduct(id) : null;
    return product ? Response.json({ product }) : Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ products: await getStore().listProducts() });
}
