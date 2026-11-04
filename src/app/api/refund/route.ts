import { runRefund } from "@/lib/refund/run";

// One-tap refund. The browser sends only which purchase. We look up the PayPal payment ourselves.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.purchaseId !== "string") return Response.json({ error: "Bad request" }, { status: 400 });
  return Response.json(await runRefund(body.purchaseId));
}
