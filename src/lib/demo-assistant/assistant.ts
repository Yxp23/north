// DEMO: "Any AI assistant". A small, generic chat assistant (Claude via the API) that stands in for an OUTSIDE agent.
// It reaches North ONLY through the MCP link (the same one any assistant would use): it has no ledger, no store, no
// PayPal and no Guardian here, and a structure test checks that. It can also read a product listing, like a web
// page. That is how a listing can try to trick it, and how the video shows the checkpoint stopping the buy.
// No third-party product UI, names or logos.
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, type ModelClient, type StepEvent, type ToolDef } from "../agents/loop";
import { AGENT_MODEL } from "../agents/models";

/** The one thing the assistant can use to reach North. The real one is an MCP client (demo-assistant/north-link.ts). */
export interface NorthLink {
  listTools(): Promise<{ name: string; description?: string; inputSchema: unknown }[]>;
  /** Calls a North tool. Returns the plain text North answered with. Throws if North can't be reached or the key is bad. */
  call(name: string, args: unknown): Promise<string>;
}
export interface Listings {
  read(id: string): Promise<{ id: string; name: string; description: string } | null>;
  /** Look in the shop, like searching a shopping site. Returns product ids and names. */
  search(query: string): Promise<{ id: string; name: string; priceText: string }[]>;
}
export type ChatTurn = { role: "person" | "assistant"; text: string };

export const ASSISTANT_SYSTEM = `You are a helpful personal AI assistant. You help one person with shopping and money errands.

You have these tools:
- search_shop: look for products in a shop. read_listing: read a product listing page.
- North's tools (request_purchase, get_spending_rules, get_week_money, get_request_status): North is the person's money checkpoint. You cannot pay for anything yourself. To buy something you must ask North with request_purchase. North checks it against the person's own rules and answers approve, wait or refuse, with a reason.
- tell_person: say something to the person. Finish every turn by calling tell_person exactly once.

When North answers, tell the person plainly what it said and why, in your own words. Do not try to get around North's answer.`;

const LABELS: Record<string, string> = {
  request_purchase: "Asking North to buy it…",
  get_spending_rules: "Asking North for the person's rules…",
  get_week_money: "Asking North how much is left this week…",
  get_request_status: "Asking North about an earlier request…",
};

export type AssistantOutcome = { reply: string | null; steps: StepEvent[]; modelCalls: number; error?: string };

export async function runAssistant(opts: {
  client: ModelClient;
  north: NorthLink;
  listings: Listings;
  message: string;
  history: ChatTurn[];
  onStep?(e: StepEvent): void;
}): Promise<AssistantOutcome> {
  const tools: ToolDef<string>[] = [];

  try {
    for (const t of await opts.north.listTools()) {
      tools.push({
        name: t.name,
        description: t.description ?? t.name,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        label: LABELS[t.name] ?? "Asking North…",
        run: async (input) => {
          try {
            return { content: await opts.north.call(t.name, input ?? {}) };
          } catch {
            return { content: "I could not reach North, or North did not accept my key.", isError: true }; // never pass on the raw error
          }
        },
      });
    }
  } catch {
    return { reply: null, steps: [], modelCalls: 0, error: "I could not reach North. Is this assistant connected, and is its key right?" };
  }

  tools.push({
    name: "search_shop",
    description: "Look for products in the shop by a few words. Returns product ids, names and prices as shown on the site.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    label: "Looking in the shop…",
    run: async (input) => {
      const q = (input as { query?: unknown } | null)?.query;
      if (typeof q !== "string" || !q.trim() || q.length > 100) return { content: "query must be a few words.", isError: true };
      const found = await opts.listings.search(q.trim()).catch(() => []);
      return { content: found.length ? found.map((f) => `${f.id}: ${f.name} (${f.priceText})`).join("\n") : "Nothing found." };
    },
  });
  tools.push({
    name: "read_listing",
    description: "Read a product listing page: its name and description.",
    input_schema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"], additionalProperties: false },
    label: "Reading the listing…",
    run: async (input) => {
      const id = (input as { product_id?: unknown } | null)?.product_id;
      const l = typeof id === "string" ? await opts.listings.read(id) : null;
      return l ? { content: `Listing "${l.name}" (id ${l.id}):\n${l.description}` } : { content: "I could not find that listing.", isError: true };
    },
  });
  tools.push({
    name: "tell_person",
    description: "Say something to the person. Call this exactly once, to finish.",
    input_schema: { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false },
    label: "Replying to you…",
    run: (input) => {
      const m = (input as { message?: unknown } | null)?.message;
      return typeof m === "string" && m.trim() ? { content: "Sent.", final: m.trim().slice(0, 1200) } : { content: "message must be some text.", isError: true };
    },
  });

  const earlier = opts.history.slice(-8).map((t) => `${t.role === "person" ? "Person" : "Assistant"}: ${t.text}`).join("\n");
  const run = await runAgent<string>({
    client: opts.client,
    model: AGENT_MODEL,
    system: ASSISTANT_SYSTEM,
    user: `${earlier ? `Earlier in this chat:\n${earlier}\n\n` : ""}The person says: ${opts.message}`,
    tools,
    finalTool: "tell_person",
    startLabel: "Reading your message…",
    onStep: opts.onStep,
  });
  if (run.end === "error") return { reply: null, steps: run.steps, modelCalls: run.modelCalls, error: run.message };
  if (run.end !== "done" || !run.result) return { reply: null, steps: run.steps, modelCalls: run.modelCalls, error: "The assistant could not finish. Please try again." };
  return { reply: run.result, steps: run.steps, modelCalls: run.modelCalls };
}
