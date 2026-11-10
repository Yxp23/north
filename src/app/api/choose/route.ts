import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { authenticate } from "@/lib/auth/guard";
import { IMAGE_MAX_BODY, readJson } from "@/lib/http/body";
import { MAX_CHOOSE_CHARS, runChooser, type ChooseOutcome } from "@/lib/agents/finder/choose";
import { storeFindBackend } from "@/lib/finder/adapter";
import { parseFinderRequest } from "@/lib/finder/request";
import { getLedger } from "@/lib/ledger/server";
import { summarize } from "@/lib/ledger/logic";
import { ndjsonResponse } from "@/lib/ndjson";
import { demoCostLimit } from "@/lib/ratelimit/demo";
import { limited } from "@/lib/ratelimit/route";
import { getStore } from "@/lib/store";

// "Help me choose". The money left this week is worked out HERE from the user's account (we only READ it), never
// taken from the browser or the model. The helper only suggests; buying is a separate tap through the Money Guardian.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = (await readJson(req, IMAGE_MAX_BODY)) as Record<string, unknown> | null;
  const parsed = parseFinderRequest(body, { maxChars: MAX_CHOOSE_CHARS });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  // The label of the picture the user tapped when asked the one question. Short plain text.
  const answer = typeof body?.answer === "string" ? body.answer.trim().slice(0, 60) : "";
  const tooMany = await limited(auth.userId, "choose", 30, 3600);
  if (tooMany) return tooMany;
  const costly = await demoCostLimit(req, "ai"); // the public demo: each visitor, and the whole demo per day
  if (costly) return costly;

  return ndjsonResponse(
    async (send) => {
      let client;
      try {
        client = getAnthropic();
      } catch {
        send({ type: "result", payload: { kind: "error", message: NOT_SET_UP } satisfies ChooseOutcome });
        return;
      }
      const leftCents = summarize(await getLedger(auth.userId).read(), new Date()).leftCents;
      const { outcome } = await runChooser({
        client,
        backend: storeFindBackend(getStore()),
        input: { text: parsed.text, imageBase64: parsed.image?.base64, imageType: parsed.image?.type, answer: answer || undefined },
        leftCents,
        canAsk: !answer, // one question, once
        onStep: (s) => send({ type: "step", ...s }),
      });
      send({ type: "result", payload: outcome });
    },
    (send) => send({ type: "result", payload: { kind: "error", message: "Something went wrong. Please try again." } satisfies ChooseOutcome }),
  );
}
