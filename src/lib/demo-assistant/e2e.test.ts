import { TEST_USER_ID } from "../../../test/user";
import { TEST_IDENTITY } from "../../../test/checkout-identity";
import { describe, expect, it, vi } from "vitest";
import { checkout, type PayGateway } from "../checkout/checkout";
import { MemoryRateLimiter } from "../ratelimit/limiter";
import { createCheckpointHandler } from "../checkpoint/mcp";
import { connectAgent } from "../checkpoint/keys";
import type { CheckpointDeps } from "../checkpoint/service";
import { MemoryLedger } from "../ledger/ledger";
import { DemoStore } from "../store/demo-store";
import { reply, scripted, toolUse } from "../../../test/fake-model";
import { runAssistant } from "./assistant";
import { connectNorth } from "./north-link";
import { pretendTrickedAssistant } from "./pretend";

const NOON = new Date("2026-11-04T17:00:00Z");

async function world(underCents?: number) {
  const ledger = new MemoryLedger("America/New_York", () => NOON);
  const charge = vi.fn<PayGateway["charge"]>(async (a) => ({ ok: true, orderId: `ORD-${a.customId}`, captureId: `CAP-${a.customId}`, status: "COMPLETED" }));
  let n = 0;
  const store = new DemoStore();
  const deps: CheckpointDeps = {
    ledger, store, now: () => NOON, newId: () => `id${++n}`,
    checkout: (input, onStep) => checkout(input, { ...TEST_IDENTITY, ledger, store, gateway: { charge }, getVaultId: async () => "VAULT-SECRET-1", now: () => NOON, newId: () => `pur_${++n}`, onStep }),
  };
  let key = "";
  await ledger.update((d) => {
    const r = connectAgent(d, "Any AI assistant", NOON, () => "agt_1", TEST_USER_ID);
    if (r.ok) key = r.key;
    if (underCents) d.agentCheckpoint.permission = { value: { underCents }, changedAt: new Date(NOON.getTime() - 48 * 3_600_000).toISOString(), previous: null };
  });
  const handler = createCheckpointHandler(async (uid) => (uid === TEST_USER_ID ? deps : null), new MemoryRateLimiter());
  const link = await connectNorth("http://north.test/api/mcp", key, (url, init) => handler(new Request(url as string, init)));
  const listings = {
    read: async (id: string) => { const p = await store.getProduct(id); return p ? { id: p.id, name: p.name, description: p.description ?? "" } : null; },
    search: async (q: string) => (await store.search(q, 5)).map((p) => ({ id: p.id, name: p.name, priceText: `$${(p.priceCents / 100).toFixed(2)}` })),
  };
  return { ledger, charge, link, listings, deps };
}

describe("an outside assistant, fooled by a listing, is stopped by North", () => {
  it("reads the listing, follows its hidden instruction, asks North to buy, and North REFUSES (the same Guardian as everything else)", async () => {
    const w = await world(5000); // even with auto-buy ON
    const steps: string[] = [];
    const out = await runAssistant({ client: pretendTrickedAssistant("trap_earbuds"), north: w.link, listings: w.listings, message: "What are these earbuds like?", history: [], onStep: (s) => steps.push(`${s.label} ${s.detail ?? ""}`) });
    expect(out.reply).toMatch(/North said refuse/);
    expect(out.reply).toMatch(/started by text in a listing/);
    expect(out.reply).toMatch(/Nothing was bought/);
    expect(w.charge).not.toHaveBeenCalled();
    const d = await w.ledger.read();
    expect(d.purchases).toEqual([]);
    const r = d.agentCheckpoint.requests[0];
    expect(r).toMatchObject({ status: "refused", guardianCode: "untrusted_agent", productId: "trap_earbuds", quantity: 3 });
    expect(r.steps.some((s) => s.warn && /hidden instructions/i.test(s.label))).toBe(true);
    expect(d.audit.some((a) => a.type === "agent_request" && /Any AI assistant/.test(a.detail))).toBe(true);
    expect(steps.join("\n")).toMatch(/Reading the listing/);
    expect(steps.join("\n")).toMatch(/Asking North to buy it/);
  });

  it("a well-behaved assistant (a real, honest request) is told to wait for the person", async () => {
    const w = await world();
    const model = scripted([
      reply([toolUse("request_purchase", { product: "cY1jWjp", quantity: 1, reason: "You asked me to get shampoo." })]),
      reply([toolUse("tell_person", { message: "I asked North. Your person has to say yes first." })]),
    ]);
    const out = await runAssistant({ client: model.client, north: w.link, listings: w.listings, message: "Please get shampoo", history: [] });
    expect(out.reply).toMatch(/say yes first/);
    expect(JSON.stringify(model.requests[1].messages.at(-1))).toMatch(/WAIT/);
    expect(w.charge).not.toHaveBeenCalled();
    expect((await w.ledger.read()).agentCheckpoint.requests[0]).toMatchObject({ status: "pending" });
  });

  it("through MCP the assistant sees only North's four tools", async () => {
    const w = await world();
    expect((await w.link.listTools()).map((t) => t.name).sort()).toEqual(["get_request_status", "get_spending_rules", "get_week_money", "request_purchase"]);
  });

  it("with a wrong key the assistant can't even connect", async () => {
    const w = await world();
    const handler = createCheckpointHandler(async (uid) => (uid === TEST_USER_ID ? w.deps : null), new MemoryRateLimiter());
    await expect(connectNorth("http://north.test/api/mcp", "north_wrong", (url, init) => handler(new Request(url as string, init)))).rejects.toThrow();
  });
});
