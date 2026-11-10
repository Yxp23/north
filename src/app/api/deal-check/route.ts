import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { authenticate } from "@/lib/auth/guard";
import { IMAGE_MAX_BODY, readJson } from "@/lib/http/body";
import { MAX_AD_CHARS, runScamChecker, type DealPayload } from "@/lib/agents/scam-checker/scam-checker";
import { channel3Backend } from "@/lib/dealcheck/channel3-backend";
import { applyDealVerdict } from "@/lib/dealcheck/apply";
import { checkImage } from "@/lib/dealcheck/image";
import { getLedger } from "@/lib/ledger/server";
import { ndjsonResponse } from "@/lib/ndjson";
import { demoCostLimit } from "@/lib/ratelimit/demo";
import { limited } from "@/lib/ratelimit/route";

// "Is this deal real?" Streams the checker's steps (one JSON line each), then one result line.
// The checker only reads and matches. A scam verdict flags the seller HERE (not inside the agent), and the
// Money Guardian refuses to pay a flagged seller. A flag can only make things stricter.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = (await readJson(req, IMAGE_MAX_BODY)) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const price = typeof body?.priceDollars === "number" ? body.priceDollars : undefined;
  if (text.length > MAX_AD_CHARS) return Response.json({ error: "That is too long. Please paste just the link or the main words." }, { status: 400 });

  let image: { base64: string; type: "image/png" | "image/jpeg" | "image/webp" | "image/gif" } | undefined;
  if (body?.imageBase64 !== undefined && body.imageBase64 !== null && body.imageBase64 !== "") {
    const checked = checkImage(String(body.imageBase64));
    if (!checked.ok) return Response.json({ error: checked.message }, { status: 400 });
    image = { base64: checked.base64, type: checked.type };
  }
  if (!text.trim() && !image) return Response.json({ error: "Please paste a link, type what the ad says, or add a picture of the ad." }, { status: 400 });
  if (price !== undefined && !(Number.isFinite(price) && price > 0 && price <= 100_000)) return Response.json({ error: "Please type a price like 27 or 27.50." }, { status: 400 });
  const tooMany = await limited(auth.userId, "deal-check", 20, 3600);
  if (tooMany) return tooMany;
  const costly = await demoCostLimit(req, "ai"); // the public demo: each visitor, and the whole demo per day
  if (costly) return costly;

  return ndjsonResponse(
    async (send) => {
      let client;
      try {
        client = getAnthropic();
      } catch {
        send({ type: "result", payload: { kind: "error", message: NOT_SET_UP } satisfies DealPayload });
        return;
      }
      const { payload, steps } = await runScamChecker({
        client,
        backend: channel3Backend,
        ad: { text, imageBase64: image?.base64, imageType: image?.type, claimedPriceCents: price === undefined ? undefined : Math.round(price * 100) },
        onStep: (s) => send({ type: "step", ...s }),
      });

      // A scam verdict flags the seller, so the Guardian refuses to pay them. If we can't save the flag, say so.
      const flagged = await applyDealVerdict(getLedger(auth.userId), payload, steps.length, new Date());
      send({ type: "result", payload, flagged });
    },
    (send) => send({ type: "result", payload: { kind: "error", message: "Something went wrong. Please try again." } satisfies DealPayload }),
  );
}
