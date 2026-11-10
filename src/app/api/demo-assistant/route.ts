import { randomUUID } from "node:crypto";
import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { authenticate } from "@/lib/auth/guard";
import { connectAgent } from "@/lib/checkpoint/keys";
import { runAssistant, type ChatTurn } from "@/lib/demo-assistant/assistant";
import { connectNorth } from "@/lib/demo-assistant/north-link";
import { pretendTrickedAssistant } from "@/lib/demo-assistant/pretend";
import { addAudit } from "@/lib/ledger/logic";
import { demoOnly } from "@/lib/demo/mode";
import { readJson } from "@/lib/http/body";
import { getLedger } from "@/lib/ledger/server";
import { ndjsonResponse } from "@/lib/ndjson";
import { demoCostLimit } from "@/lib/ratelimit/demo";
import { limited } from "@/lib/ratelimit/route";
import { getStore } from "@/lib/store";

// DEMO: "Any AI assistant", a generic chat assistant that reaches North ONLY through the MCP server (over HTTP, with
// its own key), like any outside assistant would. Demo tools only. The key comes from the browser, as it would be
// pasted into any assistant app; this route holds no PayPal, ledger or Guardian access on the assistant's behalf.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const off = demoOnly(auth.userId);
  if (off) return off;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const origin = new URL(req.url).origin;

  // Demo shortcut for "Connect an assistant" on My rules: the same call, so the video can skip copy-and-paste.
  if (body?.connect === true) {
    const now = new Date();
    const r = await getLedger(auth.userId).update((d) => {
      const c = connectAgent(d, "Any AI assistant", now, () => `agt_${randomUUID()}`, auth.userId);
      if (c.ok) addAudit(d, "agent_connect", `Connected the assistant "${c.agent.name}".`, now);
      return c;
    });
    return r.ok ? Response.json({ key: r.key, name: r.agent.name }) : Response.json({ error: r.message }, { status: 400 });
  }

  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : "";
  const key = typeof body?.key === "string" ? body.key : "";
  if (!message || !key) return Response.json({ error: "Please connect the assistant and type a message." }, { status: 400 });
  const history: ChatTurn[] = Array.isArray(body?.history)
    ? (body.history as ChatTurn[]).slice(-8).filter((t: ChatTurn) => (t?.role === "person" || t?.role === "assistant") && typeof t.text === "string").map((t: ChatTurn) => ({ role: t.role, text: t.text.slice(0, 500) }))
    : [];
  const tooMany = await limited(auth.userId, "demo-assistant", 40, 3600);
  if (tooMany) return tooMany;
  const costly = await demoCostLimit(req, "ai"); // the public demo: each visitor, and the whole demo per day
  if (costly) return costly;
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
