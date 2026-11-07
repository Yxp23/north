import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the toolkit, so we can see exactly what we ask it to do.
const calls: { name: string; args: string }[] = [];
const constructed: unknown[] = [];
vi.mock("@paypal/agent-toolkit/openai", () => ({
  PayPalAgentToolkit: class {
    constructor(opts: unknown) {
      constructed.push(opts);
    }
    async handleToolCall(c: { function: { name: string; arguments: string } }) {
      calls.push({ name: c.function.name, args: c.function.arguments });
      return { role: "tool", tool_call_id: "x", content: "{\"ok\":true}" };
    }
  },
}));

beforeEach(() => {
  calls.length = 0;
  constructed.length = 0;
  vi.resetModules();
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  process.env.PAYPAL_ENV = "sandbox";
});

describe("the read-only PayPal Agent Toolkit", () => {
  it("turns on ONLY looking things up: get order and list transactions. Nothing that moves money.", async () => {
    const { toolkitPermissions } = await import("./reader");
    expect(toolkitPermissions()).toEqual({ orders: { get: true }, transactions: { list: true } });
  });

  it("builds the toolkit with those permissions, our keys, and the sandbox", async () => {
    const { callToolkit } = await import("./reader");
    await callToolkit("get_order", { id: "9XC19429B4393930R" });
    expect(constructed).toHaveLength(1);
    expect(constructed[0]).toMatchObject({ clientId: "id", clientSecret: "secret", configuration: { actions: { orders: { get: true }, transactions: { list: true } }, context: { sandbox: true } } });
  });

  it("asks for an order by its id, and for transactions", async () => {
    const { callToolkit } = await import("./reader");
    expect(await callToolkit("get_order", { id: "9XC19429B4393930R" })).toEqual({ ok: true, text: "{\"ok\":true}" });
    await callToolkit("list_transactions", {});
    expect(calls.map((c) => c.name)).toEqual(["get_order", "list_transactions"]);
    expect(JSON.parse(calls[0].args)).toEqual({ id: "9XC19429B4393930R" });
  });

  it.each(["create_order", "pay_order", "create_refund", "create_invoice", "send_invoice", "accept_dispute_claim", "cancel_subscription", "anything_else"])("refuses %s before it reaches the toolkit", async (name) => {
    const { callToolkit } = await import("./reader");
    const r = await callToolkit(name, {});
    expect(r).toEqual({ ok: false, text: "That PayPal tool is not allowed here." });
    expect(calls).toHaveLength(0);
  });

  it("an order id that is not an order id never reaches PayPal", async () => {
    const { callToolkit } = await import("./reader");
    const r = await callToolkit("get_order", { id: "../../v1/payments" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("is off without keys, and says so", async () => {
    delete process.env.PAYPAL_CLIENT_SECRET;
    const { callToolkit } = await import("./reader");
    expect((await callToolkit("list_transactions", {})).ok).toBe(false);
  });

  it("a toolkit that throws gives a plain failure, never its message (it could hold a key)", async () => {
    vi.doMock("@paypal/agent-toolkit/openai", () => ({ PayPalAgentToolkit: class { async handleToolCall() { throw new Error("secret-123 failed"); } } }));
    vi.resetModules();
    const { callToolkit } = await import("./reader");
    const r = await callToolkit("get_order", { id: "9XC19429B4393930R" });
    expect(r).toEqual({ ok: false, text: "{\"ok\":false,\"status\":500}" });
    expect(JSON.stringify(r)).not.toContain("secret-123");
  });
});
