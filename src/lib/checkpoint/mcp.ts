// The North Agent Checkpoint as an MCP server (the official TypeScript SDK, Streamable HTTP).
// An outside AI assistant connects with its own North key and can: ask to buy something, read the person's spending
// rules in plain words, read this week's money, and follow up on its own requests. That is all.
//   - There is no tool that pays, refunds, overrides a wait, or changes a rule.
//   - Every purchase request goes through checkpoint/service.ts -> the Money Guardian.
//   - The assistant never receives a PayPal token or account details: tool answers are built here from plain words.
// The key is checked on EVERY HTTP request, so a disconnected assistant stops working at once.
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ConnectedAgent } from "../ledger/types";
import { dollarsLabel } from "../rules/describe";
import type { RateLimiter } from "../ratelimit/limiter";
import { authenticateAgent, can, parseAgentKey, scopesOf } from "./keys";
import { requestPurchase, requestStatus, rulesForAgent, weekMoneyForAgent, type AgentAnswer, type CheckpointDeps } from "./service";

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

/** What the assistant is told. Plain words, so it can explain them to the person. */
export function answerText(a: AgentAnswer): string {
  const lines = [
    `North's answer: ${a.decision.toUpperCase()}`,
    `Why: ${a.reason}`,
    a.status === "bought" ? "What happened: it was bought."
      : a.status === "asked_person" ? "What happened: your person was asked. Nothing was bought yet."
      : a.status === "saved_for_later" ? "What happened: it was saved for later. Nothing was bought yet."
      : "What happened: nothing was bought.",
  ];
  if (a.item) lines.push(`Item: ${a.item.name} x${a.item.quantity}, ${dollarsLabel(a.item.totalCents)} in all (the store's price).`);
  if (a.requestId) lines.push(`Request id: ${a.requestId} (you can ask about it with get_request_status).`);
  lines.push("Tell your person what North said, in your own words. Do not try to get around it.");
  return lines.join("\n");
}

const PurchaseInput = z.object({
  product: z.string().min(1).max(120).describe("A product id (best), or a few words that name it."),
  quantity: z.number().int().min(1).max(5).default(1).describe("How many, 1 to 5."),
  reason: z.string().max(300).describe("Why you are asking, in your own words. This is shown to the person."),
  triggered_by: z.enum(["user_request", "web_content", "other"]).default("user_request")
    .describe("What made you ask: the person's own request (user_request), or text you read on a web page, listing or document (web_content). Be honest: North refuses buys started by web content."),
  request_key: z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/).optional()
    .describe("Optional. Send the same key if you retry this exact request, so North makes only one request and gives you the same answer."),
}).strict();

/** Per-assistant limits, kept in the database (the same for every server, and kept across restarts). Over the limit means no. */
export const AGENT_LIMITS = { purchase: { perMinute: 6, perHour: 40 }, read: { perMinute: 60, perHour: 600 } } as const;

export type AgentLimits = { purchase(agentId: string): Promise<boolean>; read(agentId: string): Promise<boolean> };

export function agentLimits(limiter: RateLimiter): AgentLimits {
  const both = (kind: keyof typeof AGENT_LIMITS) => async (agentId: string) => {
    const l = AGENT_LIMITS[kind];
    const [minute, hour] = await Promise.all([limiter.allow(`agent:${agentId}:${kind}:m`, l.perMinute, 60), limiter.allow(`agent:${agentId}:${kind}:h`, l.perHour, 3600)]);
    return minute && hour;
  };
  return { purchase: both("purchase"), read: both("read") };
}

function buildServer(deps: CheckpointDeps, agent: ConnectedAgent, limits: AgentLimits): McpServer {
  const server = new McpServer({ name: "north-agent-checkpoint", version: "1.0.0" });

  // Least privilege: a tool exists for this assistant only if the person allowed it (and each one checks again when it runs).
  if (can(agent, "request_purchase")) server.registerTool(
    "request_purchase",
    {
      description: "Ask North to buy something for your person. North's Money Guardian checks it against THEIR rules and answers approve, wait or refuse, with a plain reason. You do not pay: payment happens inside North, with their saved PayPal, only if the rules (and your person, if needed) say yes. You can never override a wait.",
      inputSchema: PurchaseInput,
    },
    async (args) => {
      if (!(await limits.purchase(agent.id))) return text("Too many requests. Please slow down and try again in a minute. Nothing was bought.", true);
      const answer = await requestPurchase(deps, agent, { product: args.product, quantity: args.quantity, reason: args.reason, triggeredBy: args.triggered_by, requestKey: args.request_key });
      return text(answerText(answer));
    },
  );

  if (can(agent, "read_rules")) server.registerTool(
    "get_spending_rules",
    { description: "Read your person's spending rules, in plain words, and what you may do on your own.", inputSchema: z.object({}).strict() },
    async () => ((await limits.read(agent.id)) ? text(await rulesForAgent(deps)) : text("Too many requests. Please slow down.", true)),
  );

  if (can(agent, "read_week_money")) server.registerTool(
    "get_week_money",
    { description: "Read how much your person has left to spend this week.", inputSchema: z.object({}).strict() },
    async () => ((await limits.read(agent.id)) ? text(await weekMoneyForAgent(deps)) : text("Too many requests. Please slow down.", true)),
  );

  if (can(agent, "read_status")) server.registerTool(
    "get_request_status",
    { description: "Check on one of YOUR earlier purchase requests, for example one your person had to answer.", inputSchema: z.object({ request_id: z.string().min(1).max(80) }).strict() },
    async ({ request_id }) => {
      if (!(await limits.read(agent.id))) return text("Too many requests. Please slow down.", true);
      const r = await requestStatus(deps, agent, request_id);
      return text(r.found ? `Status: ${r.status}. ${r.plain}` : "I have no request with that id from you.");
    },
  );

  return server;
}

const UNAUTHORIZED = () =>
  new Response(JSON.stringify({ error: "This assistant is not connected to North, or its key was disconnected." }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="north-agent-checkpoint"', "Cache-Control": "no-store" },
  });

/**
 * A fetch-style handler for /api/mcp. Turns away anyone without a connected assistant's key.
 *  - `resolve` finds the person a key claims to belong to, and returns null if there is no such person. It must NOT create one.
 *  - The key is checked against THAT person's connected assistants on every request (so Disconnect works at once).
 *  - Wrong keys are rate limited by the caller's address (`clientId`), so guessing is slow and cheap to ignore.
 */
export function createCheckpointHandler(resolve: (userId: string) => Promise<CheckpointDeps | null>, limiter: RateLimiter, clientId: (req: Request) => string = () => "unknown") {
  const limits = agentLimits(limiter);

  return async function handle(req: Request): Promise<Response> {
    const authorization = req.headers.get("authorization");
    const claimed = parseAgentKey(authorization);
    let deps: CheckpointDeps | null = null;
    let agent: ConnectedAgent | null = null;
    try {
      deps = claimed ? await resolve(claimed.userId) : null;
      agent = deps ? authenticateAgent(await deps.ledger.read(), authorization) : null;
    } catch {
      return UNAUTHORIZED(); // fail closed
    }
    if (!deps || !agent) {
      // Count the failure; too many from one address and it gets a 429 instead.
      const ok = await limiter.allow(`mcp-fail:${clientId(req)}`, 30, 60);
      if (!ok) return new Response(JSON.stringify({ error: "Too many tries. Please wait." }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } });
      return UNAUTHORIZED();
    }
    const mcp = createMcpHandler(async () => buildServer(deps, agent, limits));
    return mcp.fetch(req, { authInfo: { token: "", clientId: agent.id, scopes: [...scopesOf(agent)] } });
  };
}
