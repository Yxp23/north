import { authenticate } from "@/lib/auth/guard";
import { runCheckout } from "@/lib/checkout/run";
import { parseCheckoutBody } from "@/lib/checkout/request";
import { readJson } from "@/lib/http/body";
import { limited } from "@/lib/ratelimit/route";
import { demoAllowed } from "@/lib/demo/mode";
import { ndjsonResponse } from "@/lib/ndjson";


// The browser sends only WHAT it wants (product id) and what the user tapped.
// It never sends a price. The Guardian decides; only an approval reaches PayPal.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "checkout", 60, 3600);
  if (tooMany) return tooMany;
  const parsed = parseCheckoutBody(await readJson(req), { demoOn: demoAllowed(auth.userId) });
  if (!parsed.ok) return Response.json({ error: "Bad request" }, { status: 400 });
  const input = parsed.input;

  // ?stream=1: send the plain-word steps as they happen (for the activity panel), then the outcome.
  if (new URL(req.url).searchParams.get("stream") === "1") {
    return ndjsonResponse(
      async (send) => {
        const outcome = await runCheckout(auth.userId, input, (s) => send({ type: "step", ...s }));
        send({ type: "result", outcome });
      },
      (send) => send({ type: "error" }),
    );
  }
  return Response.json(await runCheckout(auth.userId, input));
}
