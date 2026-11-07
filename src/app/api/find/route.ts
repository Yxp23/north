import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { MAX_FIND_CHARS, runFinder, type FinderOutcome } from "@/lib/agents/finder/finder";
import { storeFindBackend } from "@/lib/finder/adapter";
import { parseFinderRequest } from "@/lib/finder/request";
import { ndjsonResponse } from "@/lib/ndjson";
import { createLimiter } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

// The Finder: words or a photo -> products. Also "Buy this again" (mode "reorder": a photo is needed, 3 matches).
// It only finds. Buying is a separate tap that goes through the Money Guardian (/api/checkout).
const allow = createLimiter(40, 3_600_000);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const reorder = body?.mode === "reorder";
  const parsed = parseFinderRequest(body, { maxChars: MAX_FIND_CHARS, requireImage: reorder });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (!allow()) return Response.json({ error: "That is a lot of tries. Please wait a little while." }, { status: 429 });

  return ndjsonResponse(
    async (send) => {
      let client;
      try {
        client = getAnthropic();
      } catch {
        send({ type: "result", payload: { kind: "error", message: NOT_SET_UP } satisfies FinderOutcome });
        return;
      }
      const { outcome } = await runFinder({
        client,
        backend: storeFindBackend(getStore()),
        input: { text: parsed.text, imageBase64: parsed.image?.base64, imageType: parsed.image?.type },
        maxResults: reorder ? 3 : 5,
        onStep: (s) => send({ type: "step", ...s }),
      });
      send({ type: "result", payload: outcome });
    },
    (send) => send({ type: "result", payload: { kind: "error", message: "Something went wrong. Please try again." } satisfies FinderOutcome }),
  );
}
