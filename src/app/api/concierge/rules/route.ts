import { authenticate } from "@/lib/auth/guard";
import { runConciergeForUser } from "@/lib/agents/concierge/run";
import { MAX_WORDS } from "@/lib/agents/concierge/concierge";
import { readJson } from "@/lib/http/body";
import { limited } from "@/lib/ratelimit/route";
import { getLedger } from "@/lib/ledger/server";
import { addAudit } from "@/lib/ledger/logic";

// "My rules in my own words". Streams the agent's steps (one JSON line each) so the activity panel can
// update live, then one final line with the result. The Concierge only PROPOSES. Nothing is saved here.

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text : "";
  const fu = body?.followUp as { missing?: unknown; answer?: unknown } | undefined;
  const followUp =
    fu && (fu.missing === "amount" || fu.missing === "hour") && typeof fu.answer === "string"
      ? { missing: fu.missing as "amount" | "hour", answer: fu.answer }
      : undefined;
  if (!text.trim() || text.length > MAX_WORDS) {
    return Response.json({ error: "Please write your rule in a sentence or two." }, { status: 400 });
  }

  const tooMany = await limited(auth.userId, "concierge-rules", 30, 3600);
  if (tooMany) return tooMany;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        const { payload, steps } = await runConciergeForUser({ userId: auth.userId, text, followUp, onStep: (s) => send({ type: "step", ...s }) });
        send({ type: "result", payload });
        // Every step is kept in the audit log, in the same plain words the panel showed.
        const when = new Date();
        await getLedger(auth.userId).update((d) =>
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
