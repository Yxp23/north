import { authenticate } from "@/lib/auth/guard";
import { readJson } from "@/lib/http/body";
import { limited } from "@/lib/ratelimit/route";
import { runRefund } from "@/lib/refund/run";

// One-tap refund. The browser sends only which purchase. We look up the PayPal payment ourselves, in THIS person's own
// ledger (so another person's purchase id finds nothing).
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "refund", 30, 3600);
  if (tooMany) return tooMany;
  const body = (await readJson(req)) as { purchaseId?: unknown } | null;
  if (typeof body?.purchaseId !== "string" || body.purchaseId.length > 80) return Response.json({ error: "Bad request" }, { status: 400 });
  return Response.json(await runRefund(auth.userId, body.purchaseId));
}
