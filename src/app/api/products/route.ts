import { authenticate } from "@/lib/auth/guard";
import { getStore } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return Response.json({ products: await getStore().listProducts() });
}
