import { randomUUID } from "node:crypto";
import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { connectAgent } from "@/lib/checkpoint/keys";
import { runAssistant, type ChatTurn } from "@/lib/demo-assistant/assistant";
import { connectNorth } from "@/lib/demo-assistant/north-link";
import { pretendTrickedAssistant } from "@/lib/demo-assistant/pretend";
import { addAudit } from "@/lib/ledger/logic";
import { getLedger, isDemoMode } from "@/lib/ledger/server";
import { ndjsonResponse } from "@/lib/ndjson";
import { createLimiter } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

// DEMO: "Any AI assistant", a generic chat assistant that reaches North ONLY through the MCP server (over HTTP, with
// its own key), like any outside assistant would. Demo tools only. The key comes from the browser, as it would be
// pasted into any assistant app; this route holds no PayPal, ledger or Guardian access on the assistant's behalf.
const allow = createLimiter(40, 3_600_000);

export async function POST(req: Request) {
  if (!isDemoMode()) return Response.json({ error: "Not available" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const origin = new URL(req.url).origin;

  // Demo shortcut for "Connect an assistant" on My rules: the same call, so the video can skip copy-and-paste.
  if (body?.connect === true) {
    const now = new Date();
    const r = await getLedger().update((d) => {
      const c = connectAgent(d, "Any AI assistant", now, () => `agt_${randomUUID()}`);
      if (c.ok) addAudit(d, "agent_connect", `Connected the assistant "${c.agent.name}".`, now);
      return c;
    });
    return r.ok ? Response.json({ key: r.key, name: r.agent.name }) : Response.json({ error: r.message }, { status: 400 });
  }

  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : "";
  const key = typeof body?.key === "string" ? body.key : "";
  if (!message || !key) return Response.json({ error: "Please connect the assistant and type a message." }, { status: 400 });
  const history: ChatTurn[] = Array.isArray(body?.history)
    ? body.history.slice(-8).filter((t: ChatTurn) => (t?.role === "person" || t?.role === "assistant") && typeof t.text === "string").map((t: ChatTurn) => ({ role: t.role, text: t.text.slice(0, 500) }))
    : [];
  if (!allow()) return Response.json({ error: "That is a lot of tries. Please wait a little while." }, { status: 429 });
  const pretend = body?.pretendTricked === true;

  return ndjsonResponse(
    async (send) => {
      const step = (s: unknown) => send({ type: "step", ...(s as object) });
      let client;
      try {
        client = pretend ? pretendTrickedAssistant("trap_earbuds") : getAnthropic();
      } catch {
        send({ type: "result", payload: { reply: null, error: NOT_SET_UP } });
        return;
      }
      if (pretend) step({ label: "Pretend test: this assistant is made to follow a listing's hidden text.", state: "done", warn: true });

      let link;
      try {
        link = await connectNorth(`${origin}/api/mcp`, key);
      } catch {
        send({ type: "result", payload: { reply: null, error: "North did not accept this assistant's key. It may have been disconnected. Connect it again." } });
        return;
      }
      try {
        const store = getStore();
        const out = await runAssistant({
          client, north: link, message, history, onStep: step,
          listings: {
            read: async (id) => { const p = await store.getProduct(id); return p ? { id: p.id, name: p.name, description: p.description ?? "" } : null; },
            search: async (q) => (await store.search(q, 5)).map((p) => ({ id: p.id, name: p.name, priceText: `$${(p.priceCents / 100).toFixed(2)}` })),
          },
        });
        send({ type: "result", payload: { reply: out.reply, error: out.error } });
      } finally {
        await link.close().catch(() => undefined);
      }
    },
    (send) => send({ type: "result", payload: { reply: null, error: "Something went wrong. Please try again." } }),
  );
}
