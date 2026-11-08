import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { authenticate } from "@/lib/auth/guard";
import { readJson } from "@/lib/http/body";
import { runConciergeListing } from "@/lib/agents/concierge/listing";
import { pretendTrickedClient } from "@/lib/agents/concierge/pretend-tricked";
import type { StepEvent } from "@/lib/agents/loop";
import { demoAllowed } from "@/lib/demo/mode";
import { getLedger } from "@/lib/ledger/server";
import { addAudit, buildUserState } from "@/lib/ledger/logic";
import { ndjsonResponse } from "@/lib/ndjson";
import { judgeProposals } from "@/lib/proposals/judge";
import { limited } from "@/lib/ratelimit/route";
import { getStore } from "@/lib/store";

// "Ask the helper about this". The Concierge reads a listing (untrusted text). If it is fooled into suggesting a
// buy, the suggestion goes to the Money Guardian, marked as started by an agent, and is refused. Nothing here
// can charge anything: this route does not import checkout.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const productId = typeof body?.productId === "string" ? body.productId : "";
  if (!productId || productId.length > 80) return Response.json({ error: "Bad request" }, { status: 400 });
  const store = getStore();
  const product = await store.getProduct(productId);
  if (!product) return Response.json({ error: "I could not find that product." }, { status: 404 });
  const tooMany = await limited(auth.userId, "listing", 30, 3600);
  if (tooMany) return tooMany;
  // "Pretend the AI is tricked" is a demo tool. It only works when demo tools are on.
  const pretend = body?.pretendTricked === true && demoAllowed(auth.userId);

  return ndjsonResponse(
    async (send) => {
      const step = (s: StepEvent) => send({ type: "step", ...s });
      let client;
      try {
        client = pretend ? pretendTrickedClient(productId) : getAnthropic();
      } catch {
        send({ type: "result", payload: { error: NOT_SET_UP } });
        return;
      }
      if (pretend) step({ label: "Pretend test: the AI is made to follow the hidden text.", state: "done", warn: true });

      const outcome = await runConciergeListing({
        client,
        readListing: async (id) => {
          const p = await store.getProduct(id);
          return p ? { id: p.id, name: p.name, description: p.description ?? "" } : null;
        },
        productId,
        onStep: step,
      });

      // Anything the helper suggested goes to the Money Guardian. We only ever READ the ledger to judge it.
      const now = new Date();
      const data = await getLedger(auth.userId).read();
      const judged = await judgeProposals(outcome.proposals, { store, state: buildUserState(data, now), flaggedSellers: data.flaggedSellers.map((f) => f.domain), at: now });
      for (const j of judged) {
        step({ label: "Asking the Money Guardian about the buy the helper suggested…", state: "working" });
        step({ label: "Asking the Money Guardian about the buy the helper suggested…", state: "done", detail: j.result ? `Money Guardian: ${j.result.decision} (${j.result.code}). ${j.result.reason}` : "That product does not exist." });
        step({ label: j.result ? `The Money Guardian said no: ${j.result.reason}` : "I couldn't find that product.", state: "done", warn: true });
      }

      await getLedger(auth.userId)
        .update((d) => {
          addAudit(d, "helper_listing", `Helper read ${product.name}. Hidden instructions found: ${outcome.hiddenFound.length ? "yes" : "no"}. Buys suggested: ${judged.length}.`, now);
          for (const j of judged) addAudit(d, "agent_proposal", `${j.plain}`, now);
        })
        .catch(() => undefined); // the log is nice to have; never fail the answer over it

      send({
        type: "result",
        payload: {
          summary: outcome.summary,
          hidden: outcome.hiddenFound.map((h) => ({ productName: h.productName })),
          judged: judged.map((j) => ({ plain: j.plain, productName: j.productName, quantity: j.quantity, amountCents: j.amountCents, code: j.result?.code, reason: j.result?.reason })),
          error: outcome.error,
        },
      });
    },
    (send) => send({ type: "result", payload: { error: "Something went wrong. Please try again." } }),
  );
}
