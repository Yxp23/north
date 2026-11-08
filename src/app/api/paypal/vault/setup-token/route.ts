import { authenticate } from "@/lib/auth/guard";
import { createSetupToken } from "@/lib/paypal";
import { limited } from "@/lib/ratelimit/route";

// Step 1 of connecting PayPal: ask PayPal for a one-time setup token. No order, no money.
// The page PayPal sends the person back to is built from NORTH_SITE_URL when it is set (so a forged Host header
// can't redirect the approval somewhere else).
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "paypal-setup", 20, 3600);
  if (tooMany) return tooMany;
  const origin = process.env.NORTH_SITE_URL ? new URL(process.env.NORTH_SITE_URL).origin : new URL(req.url).origin;
  const r = await createSetupToken(origin);
  if (!r.ok || typeof r.body?.id !== "string") {
    return Response.json({ error: "Could not start PayPal" }, { status: 502 }); // PayPal's own error text is not passed on
  }
  return Response.json({ id: r.body.id });
}
