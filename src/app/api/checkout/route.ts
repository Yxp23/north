import { runCheckout } from "@/lib/checkout/run";
import { localHour } from "@/lib/guardian";
import { isDemoMode, TIME_ZONE } from "@/lib/ledger/server";
import { ndjsonResponse } from "@/lib/ndjson";

// The browser sends only WHAT it wants (product id) and what the user tapped.
// It never sends a price. The Guardian decides; only an approval reaches PayPal.
export async function POST(req: Request) {
  let body: { productId?: unknown; attemptId?: unknown; overrideWait?: unknown; pretendHour?: unknown; seenCents?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { productId, attemptId, overrideWait, pretendHour, seenCents } = body;
  if (typeof productId !== "string" || typeof attemptId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(attemptId)) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Demo clock: "pretend it is 11 PM". Only when demo tools are on.
  let at: Date | undefined;
  if (isDemoMode() && typeof pretendHour === "number" && Number.isInteger(pretendHour) && pretendHour >= 0 && pretendHour <= 23) {
    const now = new Date();
    at = new Date(now.getTime() + (pretendHour - localHour(now, TIME_ZONE)) * 3_600_000);
  }

  // The price the user saw. It can only STOP a buy whose live price is different; it never sets a price.
  const seen = typeof seenCents === "number" && Number.isSafeInteger(seenCents) && seenCents > 0 ? seenCents : undefined;
  const input = { productId, attemptId, overrideWait: overrideWait === true, at, seenCents: seen };

  // ?stream=1: send the plain-word steps as they happen (for the activity panel), then the outcome.
  if (new URL(req.url).searchParams.get("stream") === "1") {
    return ndjsonResponse(
      async (send) => {
        const outcome = await runCheckout(input, (s) => send({ type: "step", ...s }));
        send({ type: "result", outcome });
      },
      (send) => send({ type: "error" }),
    );
  }
  return Response.json(await runCheckout(input));
}
