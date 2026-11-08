import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { authenticate } from "@/lib/auth/guard";
import { readJson } from "@/lib/http/body";
import { MAX_QUESTION_CHARS, runPaymentsHelper, type PaymentsOutcome } from "@/lib/agents/payments/payments";
import { getLedger } from "@/lib/ledger/server";
import { ndjsonResponse } from "@/lib/ndjson";
import { createPaymentsBackend } from "@/lib/payments-help/backend";
import { callToolkit } from "@/lib/paypal-toolkit/reader";
import { limited } from "@/lib/ratelimit/route";

// "Did my order go through?" / "Show my last payments". The helper asks PayPal through the PayPal Agent Toolkit,
// which is turned on for LOOKING only. We only READ the ledger here. This route can't charge or refund anything.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Please tell me what you want to know about your payments." }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) return Response.json({ error: "That is too long. Please ask in a few words." }, { status: 400 });
  const tooMany = await limited(auth.userId, "payments", 30, 3600);
  if (tooMany) return tooMany;

  return ndjsonResponse(
    async (send) => {
      let client;
      try {
        client = getAnthropic();
      } catch {
        send({ type: "result", payload: { kind: "error", message: NOT_SET_UP } satisfies PaymentsOutcome });
        return;
      }
      const data = await getLedger(auth.userId).read();
      const { outcome } = await runPaymentsHelper({
        client,
        backend: createPaymentsBackend({ purchases: data.purchases, call: callToolkit }),
        question,
        onStep: (s) => send({ type: "step", ...s }),
      });
      send({ type: "result", payload: outcome });
    },
    (send) => send({ type: "result", payload: { kind: "error", message: "Something went wrong. Please try again." } satisfies PaymentsOutcome }),
  );
}
