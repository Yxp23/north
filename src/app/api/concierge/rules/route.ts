import { runConciergeForUser } from "@/lib/agents/concierge/run";
import { MAX_WORDS } from "@/lib/agents/concierge/concierge";
import { getLedger } from "@/lib/ledger/server";
import { addAudit } from "@/lib/ledger/logic";

// "My rules in my own words". Streams the agent's steps (one JSON line each) so the activity panel can
// update live, then one final line with the result. The Concierge only PROPOSES. Nothing is saved here.

// A simple limit so a loop in the browser can't run up the AI bill: 30 requests an hour.
const WINDOW_MS = 3_600_000;
const LIMIT = 30;
const recent: number[] = [];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const fu = body?.followUp;
  const followUp =
    fu && (fu.missing === "amount" || fu.missing === "hour") && typeof fu.answer === "string"
      ? { missing: fu.missing as "amount" | "hour", answer: fu.answer }
      : undefined;
  if (!text.trim() || text.length > MAX_WORDS) {
    return Response.json({ error: "Please write your rule in a sentence or two." }, { status: 400 });
  }

  const now = Date.now();
  while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
  if (recent.length >= LIMIT) {
    return Response.json({ error: "That is a lot of tries. Please wait a little while." }, { status: 429 });
  }
  recent.push(now);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        const { payload, steps } = await runConciergeForUser({ text, followUp, onStep: (s) => send({ type: "step", ...s }) });
        send({ type: "result", payload });
        // Every step is kept in the audit log, in the same plain words the panel showed.
        const when = new Date();
        await getLedger().update((d) =>
          addAudit(d, "concierge", `Rule helper (${payload.kind}): ${steps.filter((s) => s.state === "working").map((s) => s.label).join(" ")} | You wrote: ${text.slice(0, 200)}`, when),
        );
      } catch (e) {
        console.error("[concierge] failed:", e instanceof Error ? e.name : "unknown");
        send({ type: "result", payload: { kind: "error", message: "Something went wrong. Please try again." } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
