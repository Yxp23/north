import { authenticate } from "@/lib/auth/guard";
import { checkpointDeps } from "@/lib/checkpoint/run";
import { previewPurchase } from "@/lib/checkpoint/service";
import { demoOnly } from "@/lib/demo/mode";
import { readJson } from "@/lib/http/body";
import { limited } from "@/lib/ratelimit/route";

// "Try to break North" (demo only). A practice run of an assistant's ask: the Guardian's real decision, live, with nothing saved and
// nothing bought (previewPurchase writes nothing, and this route does not import checkout).
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const off = demoOnly(auth.userId);
  if (off) return off;
  const tooMany = await limited(auth.userId, "break", 120, 3600);
  if (tooMany) return tooMany;
  const b = (await readJson(req)) as Record<string, unknown> | null;
  const triggered = b?.triggered_by === "web_content" || b?.triggered_by === "other" ? b.triggered_by : "user_request";
  const preview = await previewPurchase(checkpointDeps(auth.userId), {
    product: typeof b?.product === "string" ? b.product.slice(0, 120) : "",
    quantity: typeof b?.quantity === "number" ? b.quantity : 1,
    reason: typeof b?.reason === "string" ? b.reason.slice(0, 600) : "",
    triggeredBy: triggered,
  });
  return Response.json(preview);
}
