import { getStore } from "@/lib/store";

export async function GET() {
  return Response.json({ products: await getStore().listProducts() });
}
