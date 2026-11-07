import { connectAgent, revokeAgent } from "@/lib/checkpoint/keys";
import { changeAssistantPermission } from "@/lib/checkpoint/permission";
import { checkpointDeps } from "@/lib/checkpoint/run";
import { answerRequest } from "@/lib/checkpoint/service";
import { assistantsView } from "@/lib/checkpoint/views";
import { addAudit } from "@/lib/ledger/logic";
import { getLedger } from "@/lib/ledger/server";
import { createLimiter } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";

// The PERSON's side of the Agent Checkpoint, used by the My rules and home screens: connect or disconnect an
// assistant, change what it may do on its own, and answer its one-tap cards. An assistant's key does not work here
// (only on /api/mcp). Nothing here can approve a buy except the person's own Yes, which goes through guarded checkout.
const allowConnect = createLimiter(20, 3_600_000);

export async function GET(req: Request) {
  const data = await getLedger().read();
  return Response.json({ ...assistantsView(data, new Date()), mcpUrl: `${new URL(req.url).origin}/api/mcp` });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ledger = getLedger();
  const now = new Date();

  switch (body?.action) {
    case "connect": {
      if (!allowConnect()) return Response.json({ error: "That is a lot of tries. Please wait a little while." }, { status: 429 });
      const result = await ledger.update((d) => {
        const r = connectAgent(d, typeof body.name === "string" ? body.name : "", now, () => `agt_${randomUUID()}`);
        if (r.ok) addAudit(d, "agent_connect", `Connected the assistant "${r.agent.name}".`, now);
        return r;
      });
      if (!result.ok) return Response.json({ error: result.message }, { status: 400 });
      // The key is shown ONCE, here. Only its hash is kept.
      return Response.json({ id: result.agent.id, name: result.agent.name, key: result.key, mcpUrl: `${new URL(req.url).origin}/api/mcp` });
    }
    case "revoke": {
      const id = typeof body.id === "string" ? body.id : "";
      const ok = await ledger.update((d) => {
        const done = revokeAgent(d, id, now);
        if (done) addAudit(d, "agent_disconnect", `Disconnected an assistant (${d.agentCheckpoint.agents.find((a) => a.id === id)?.name ?? id}).`, now);
        return done;
      });
      return Response.json({ status: ok ? "disconnected" : "not_found" }, { status: ok ? 200 : 404 });
    }
    case "permission": {
      // null = "Ask me every time". A number of dollars = "buy must-have things under $X without asking".
      const dollars = body.underDollars;
      const next = dollars === null ? null : typeof dollars === "number" && Number.isFinite(dollars) ? { underCents: Math.round(dollars * 100) } : undefined;
      if (next === undefined) return Response.json({ error: "Please pick an amount in dollars." }, { status: 400 });
      const result = await ledger.update((d) => {
        const r = changeAssistantPermission(d, next, now);
        if (r.ok && r.changed) addAudit(d, "rule_change", `By hand: assistant permission ${next ? `under $${(next.underCents / 100).toFixed(2)}` : "ask me every time"}. ${r.startsNow ? "Started right away." : "Starts in one day."}`, now);
        return r;
      });
      return Response.json(result, { status: result.ok ? 200 : 400 });
    }
    case "answer": {
      if (typeof body.id !== "string" || (body.answer !== "yes" && body.answer !== "no")) return Response.json({ error: "Bad request" }, { status: 400 });
      return Response.json(await answerRequest(checkpointDeps(), body.id, body.answer));
    }
    default:
      return Response.json({ error: "Bad request" }, { status: 400 });
  }
}
