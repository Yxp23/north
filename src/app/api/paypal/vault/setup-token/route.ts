import { createSetupToken } from "@/lib/paypal";

// Step 1 of connecting PayPal: ask PayPal for a one-time setup token. No order, no money.
export async function POST(req: Request) {
  const r = await createSetupToken(new URL(req.url).origin);
  if (!r.ok || typeof r.body?.id !== "string") {
    return Response.json({ error: "Could not start PayPal", detail: r.body }, { status: 502 });
  }
  return Response.json({ id: r.body.id });
}
