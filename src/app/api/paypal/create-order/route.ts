import { createVaultOrder, SPIKE_AMOUNT } from "@/lib/paypal";

export async function POST(req: Request) {
  const r = await createVaultOrder(SPIKE_AMOUNT, new URL(req.url).origin);
  if (!r.ok) return Response.json({ error: "create order failed", raw: r.body }, { status: 502 });
  return Response.json({ orderId: r.body.id, raw: r.body });
}
