import { POST as dealCheck } from "@/app/api/deal-check/route";
import { POST as findRoute } from "@/app/api/find/route";
import { POST as chooseRoute } from "@/app/api/choose/route";
import { POST as paymentsRoute } from "@/app/api/concierge/payments/route";
import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { MAX_ASK_CHARS, type Destination } from "@/lib/agents/concierge/router";
import { runAsk, type Delegate, type Delegates } from "@/lib/ask/ask";
import { parseFinderRequest } from "@/lib/finder/request";
import { ndjsonResponse } from "@/lib/ndjson";
import { createLimiter } from "@/lib/rate-limit";

// "Ask North". The Concierge reads what the person typed or uploaded and routes it to one of North's helpers, and the
// handoff shows in the activity panel. Each helper is the same route its own page uses (so every check and limit still
// applies). Routing can't move money: none of these helpers can buy, and this route does not import checkout.
const allow = createLimiter(40, 3_600_000);

/** Runs one of the existing helper routes, passes its steps on, and returns what it answered with. */
const viaRoute = (handler: (req: Request) => Promise<Response>, body: (r: Parameters<Delegate>[0]) => unknown): Delegate => async (req, onStep) => {
  const res = await handler(new Request("http://north.internal/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(req)) }));
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    return { payload: { kind: "error", message: typeof j?.error === "string" ? j.error : "Something went wrong. Please try again." } };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { payload?: unknown; flagged?: unknown } | null = null;
  const line = (raw: string) => {
    if (!raw.trim()) return;
    try {
      const j = JSON.parse(raw);
      if (j.type === "step") onStep({ label: String(j.label), state: j.state, detail: j.detail, warn: j.warn });
      else if (j.type === "result") result = { payload: j.payload, flagged: j.flagged };
    } catch {
      /* a broken line is skipped */
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    parts.forEach(line);
  }
  line(buffer);
  return result ?? { payload: { kind: "error", message: "Something went wrong. Please try again." } };
};

const delegates: Delegates = {
  scam_checker: viaRoute(dealCheck, (r) => ({ text: r.text, imageBase64: r.imageBase64, priceDollars: r.extra.priceDollars })),
  finder: viaRoute(findRoute, (r) => ({ text: r.text, imageBase64: r.imageBase64 })),
  help_me_choose: viaRoute(chooseRoute, (r) => ({ text: r.text, imageBase64: r.imageBase64, answer: r.extra.answer })),
  payments: viaRoute(paymentsRoute, (r) => ({ question: r.text })),
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseFinderRequest(body, { maxChars: MAX_ASK_CHARS });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (!allow()) return Response.json({ error: "That is a lot of tries. Please wait a little while." }, { status: 429 });
  const route = typeof body?.route === "string" ? (body.route as Destination) : undefined;

  return ndjsonResponse(
    async (send) => {
      let client;
      try {
        client = getAnthropic();
      } catch {
        send({ type: "result", route: "error", payload: { message: NOT_SET_UP } });
        return;
      }
      const out = await runAsk({
        client, delegates, onStep: (s) => send({ type: "step", ...s }),
        input: { text: parsed.text, image: parsed.image && { base64: parsed.image.base64, type: parsed.image.type }, route, extra: body?.extra },
      });
      send({ type: "result", route: out.route, payload: out.payload });
    },
    (send) => send({ type: "result", route: "error", payload: { message: "Something went wrong. Please try again." } }),
  );
}
