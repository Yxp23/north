import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The Agent Checkpoint: an outside assistant can ASK. Only North's Guardian (and the person) decide, and money moves only
// through guarded checkout. These checks keep that true as the code changes.
const SRC = path.resolve(__dirname, "../..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
  });
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const nonTest = files(SRC).filter((f) => !/\.test\.tsx?$/.test(f));
const read = (r: string) => code(path.join(SRC, r));

describe("an assistant's key is accepted only on the MCP route", () => {
  it("only mcp.ts checks assistant keys", () => {
    const users = nonTest.filter((f) => /authenticateAgent\(/.test(code(f)) && rel(f) !== "lib/checkpoint/keys.ts").map(rel);
    expect(users).toEqual(["lib/checkpoint/mcp.ts"]);
  });
  it("only the MCP route reaches the MCP handler", () => {
    const users = nonTest.filter((f) => /mcpHandler/.test(code(f)) && rel(f) !== "lib/checkpoint/run.ts").map(rel);
    expect(users).toEqual(["app/api/mcp/route.ts", "lib/auth/public-paths.ts"]); // (the second only names it, as the marker for the public list)
  });
  it("no other route reads an Authorization header except the scheduled price check (its own secret)", () => {
    const routes = nonTest.filter((f) => rel(f).startsWith("app/api/") && /authorization/i.test(code(f))).map(rel);
    expect(routes.sort()).toEqual(["app/api/watch/run/route.ts"]);
  });
});

describe("an assistant can't reach PayPal or the ledger's write side", () => {
  const checkpointFiles = nonTest.filter((f) => rel(f).startsWith("lib/checkpoint/"));
  it("only run.ts imports the real checkout wiring; nothing else in the checkpoint imports PayPal, the gateway, or the store's checkout", () => {
    for (const f of checkpointFiles) {
      const imports = [...code(f).matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        if (rel(f) === "lib/checkpoint/run.ts") continue;
        expect(spec, `${rel(f)} imports ${spec}`).not.toMatch(/checkout\/run|gateway|paypal|agent-toolkit/i);
      }
    }
  });
  it("the checkpoint reaches checkout only as the `checkout` dependency", () => {
    expect(read("lib/checkpoint/service.ts")).toMatch(/checkout\(input: CheckoutInput/);
    expect(read("lib/checkpoint/run.ts")).toMatch(/checkout: \(input, onStep\) => runCheckout\(userId, input, onStep\)/);
  });
  it("the MCP file builds answers from plain words: no ledger write, no vault, no keys", () => {
    const text = read("lib/checkpoint/mcp.ts");
    expect(text).not.toMatch(/\.update\(|paypalVault|vaultId|keyHash/);
  });
});

describe("an assistant can never press Buy now", () => {
  it("the Guardian is asked with overrideWait: false for an assistant's request", () => {
    const text = read("lib/checkpoint/service.ts");
    const request = text.slice(text.indexOf("export async function requestPurchase"), text.indexOf("export type AnswerResult"));
    expect(request).toMatch(/overrideWait: false/);
    expect(request).not.toMatch(/overrideWait:\s*(true|r\.|input\.|args\.)/);
  });
  it("only the PERSON's answer can pass overrideWait on to checkout", () => {
    const text = read("lib/checkpoint/service.ts");
    const answer = text.slice(text.indexOf("export async function answerRequest"), text.indexOf("export type RequestStatusAnswer"));
    expect(answer).toMatch(/overrideWait: r\.needsOverride/);
    // ...and nothing before it does.
    expect(text.slice(0, text.indexOf("export async function answerRequest"))).not.toMatch(/overrideWait:\s*(true|r\.needsOverride)/);
  });
  it("the request tool has no field an assistant could use to override", () => {
    const text = read("lib/checkpoint/mcp.ts");
    const schema = text.slice(text.indexOf("const PurchaseInput"), text.indexOf("function buildServer"));
    expect(schema).not.toMatch(/override|buy_now|force|skip|bypass/i);
  });
  it("the card's Yes is answered through one door, answerRequest, from the person's own route", () => {
    const users = nonTest.filter((f) => /answerRequest\(/.test(code(f)) && rel(f) !== "lib/checkpoint/service.ts").map(rel);
    expect(users).toEqual(["app/api/agents/route.ts"]);
  });
});

describe("the MCP tools", () => {
  it("are exactly: request_purchase, get_spending_rules, get_week_money, get_request_status", () => {
    const names = [...read("lib/checkpoint/mcp.ts").matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(["get_request_status", "get_spending_rules", "get_week_money", "request_purchase"]);
  });
});
