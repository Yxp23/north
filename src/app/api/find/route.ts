import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { authenticate } from "@/lib/auth/guard";
import { IMAGE_MAX_BODY, readJson } from "@/lib/http/body";
import { MAX_FIND_CHARS, runFinder, type FinderOutcome } from "@/lib/agents/finder/finder";
import { storeFindBackend } from "@/lib/finder/adapter";
import { parseFinderRequest } from "@/lib/finder/request";
import { ndjsonResponse } from "@/lib/ndjson";
import { limited } from "@/lib/ratelimit/route";
import { getStore } from "@/lib/store";

// The Finder: words or a photo -> products. Also "Buy this again" (mode "reorder": a photo is needed, 3 matches).
// It only finds. Buying is a separate tap that goes through the Money Guardian (/api/checkout).
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = (await readJson(req, IMAGE_MAX_BODY)) as Record<string, unknown> | null;
  const reorder = body?.mode === "reorder";
  const parsed = parseFinderRequest(body, { maxChars: MAX_FIND_CHARS, requireImage: reorder });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const tooMany = await limited(auth.userId, "find", 40, 3600);
  if (tooMany) return tooMany;

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
