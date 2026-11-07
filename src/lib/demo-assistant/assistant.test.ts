import { describe, expect, it, vi } from "vitest";
import { ASSISTANT_SYSTEM, runAssistant, type Listings, type NorthLink } from "./assistant";
import type { StepEvent } from "../agents/loop";
import { reply, scripted, text, toolUse } from "../../../test/fake-model";

const TOOLS = [
  { name: "request_purchase", description: "Ask North to buy something.", inputSchema: { type: "object", properties: { product: { type: "string" }, quantity: { type: "number" }, reason: { type: "string" } }, required: ["product", "reason"] } },
  { name: "get_week_money", description: "Read this week's money.", inputSchema: { type: "object", properties: {} } },
];
const north = (over: Partial<NorthLink> = {}): NorthLink => ({
  listTools: async () => TOOLS,
  call: vi.fn(async (name: string) => (name === "get_week_money" ? "Your person has $400 left." : "North's answer: REFUSE\nWhy: no")),
  ...over,
});
const listings: Listings = {
  read: async (id) => (id === "L1" ? { id, name: "Warm Socks", description: "Soft socks." } : null),
  search: async (q) => (/sock/i.test(q) ? [{ id: "L1", name: "Warm Socks", priceText: "$11" }] : []),
};
const tell = (message: string) => toolUse("tell_person", { message });

async function run(replies: Parameters<typeof scripted>[0], link = north(), message = "Get me warm socks") {
  const m = scripted(replies);
  const steps: StepEvent[] = [];
  const out = await runAssistant({ client: m.client, north: link, listings, message, history: [], onStep: (s) => steps.push(s) });
  return { out, m, steps, link };
}

describe("a generic AI assistant that reaches North only through MCP", () => {
  it("offers the model North's tools exactly as the MCP server listed them, plus its own look-at-a-listing and reply tools", async () => {
    const { m } = await run([reply([tell("Hi")])]);
    expect((m.requests[0].tools as { name: string }[]).map((t) => t.name).sort()).toEqual(["get_week_money", "read_listing", "request_purchase", "search_shop", "tell_person"]);
  });

  it("calls North through the link and shows the call in the activity panel", async () => {
    const link = north();
    const { out, steps } = await run([reply([toolUse("request_purchase", { product: "L1", quantity: 1, reason: "You asked" })]), reply([tell("North said no.")])], link);
    expect(link.call).toHaveBeenCalledWith("request_purchase", { product: "L1", quantity: 1, reason: "You asked" });
    expect(out.reply).toBe("North said no.");
    const done = steps.find((s) => s.state === "done" && /Asking North/.test(s.label));
    expect(done?.detail).toMatch(/request_purchase/);
    expect(done?.detail).toMatch(/REFUSE/);
  });

  it("can read a listing, like a web page", async () => {
    const { m } = await run([reply([toolUse("read_listing", { product_id: "L1" })]), reply([tell("ok")])]);
    expect(JSON.stringify(m.requests[1].messages.at(-1))).toContain("Warm Socks");
  });

  it("can look in the shop and gets ids back", async () => {
    const { m } = await run([reply([toolUse("search_shop", { query: "socks" })]), reply([tell("ok")])]);
    expect(JSON.stringify(m.requests[1].messages.at(-1))).toContain("L1: Warm Socks ($11)");
  });

  it("a listing that doesn't exist is said plainly", async () => {
    const { m } = await run([reply([toolUse("read_listing", { product_id: "nope" })]), reply([tell("ok")])]);
    expect(JSON.stringify(m.requests[1].messages.at(-1))).toMatch(/is_error":true/);
  });

  it("when North is down or says no, the assistant hears it as an error or an answer, and can explain", async () => {
    const link = north({ call: vi.fn(async () => { throw new Error("connection refused: secret-detail"); }) });
    const { m, out } = await run([reply([toolUse("get_week_money")]), reply([tell("I couldn't reach North.")])], link);
    expect(out.reply).toBe("I couldn't reach North.");
    expect(JSON.stringify(m.requests[1].messages.at(-1))).not.toContain("secret-detail");
  });

  it("the person's earlier chat is part of what it sees", async () => {
    const m = scripted([reply([tell("ok")])]);
    await runAssistant({ client: m.client, north: north(), listings, message: "And one more", history: [{ role: "person", text: "Get socks" }, { role: "assistant", text: "Asked North." }], onStep: () => undefined });
    const sent = JSON.stringify(m.requests[0].messages[0].content);
    expect(sent).toContain("Get socks");
    expect(sent).toContain("And one more");
  });

  it("it is a plain, generic assistant: no brand, and it knows it can't pay by itself", () => {
    expect(ASSISTANT_SYSTEM).toMatch(/North/);
    expect(ASSISTANT_SYSTEM).not.toMatch(/openai|chatgpt|gemini|alexa|siri|copilot/i);
    expect(ASSISTANT_SYSTEM).toMatch(/cannot pay/i);
  });

  it("at most about 6 model calls", async () => {
    const { m } = await run([reply([toolUse("get_week_money")])]);
    expect(m.calls()).toBeLessThanOrEqual(6);
  });

  it("a model that never answers is an error with kind words", async () => {
    const { out } = await run([reply([text("hm")], "end_turn")]);
    expect(out.error).toBeTruthy();
  });
});
