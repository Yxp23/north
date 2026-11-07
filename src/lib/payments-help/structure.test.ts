import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The PayPal Agent Toolkit may only LOOK. Money moves only through the Guardian's checkout. These checks keep it that way.
const SRC = path.resolve(__dirname, "../..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
  });
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const nonTest = files(SRC).filter((f) => !/\.test\.tsx?$/.test(f));

describe("the PayPal Agent Toolkit is read-only", () => {
  it("only reader.ts imports the toolkit", () => {
    const importers = nonTest.filter((f) => /from\s+["']@paypal\/agent-toolkit/.test(code(f))).map(rel);
    expect(importers).toEqual(["lib/paypal-toolkit/reader.ts"]);
  });

  it("the toolkit is built with only looking things up turned on", () => {
    const text = code(path.join(SRC, "lib/paypal-toolkit/reader.ts"));
    expect(text).toContain("orders: { get: true }");
    expect(text).toContain("transactions: { list: true }");
    // No money-moving or changing action is ever switched on.
    for (const bad of ["create", "pay", "capture", "refund", "cancel", "send", "invoices", "subscription", "disputes", "shipment", "products"]) {
      expect(text, `reader.ts mentions "${bad}"`).not.toMatch(new RegExp(`\\b${bad}\\w*\\s*:\\s*true`, "i"));
    }
  });

  it("the methods we allow are exactly get_order and list_transactions", () => {
    const text = code(path.join(SRC, "lib/paypal-toolkit/reader.ts"));
    expect(text).toMatch(/ALLOWED_METHODS = \["get_order", "list_transactions"\] as const/);
  });

  it("only the payments backend and its route use reader.ts", () => {
    const users = nonTest.filter((f) => /paypal-toolkit\/reader|from\s+["']\.\/reader["']/.test(code(f)) && rel(f) !== "lib/paypal-toolkit/reader.ts").map(rel);
    expect(users.sort()).toEqual(["app/api/concierge/payments/route.ts"]);
  });

  it("checkout never uses the toolkit (it can't use a saved-account token), and the toolkit code never imports checkout or the Guardian's approval", () => {
    for (const f of nonTest.filter((x) => rel(x).startsWith("lib/checkout/"))) expect(code(f), rel(f)).not.toMatch(/paypal-toolkit|agent-toolkit/);
    for (const f of nonTest.filter((x) => /^lib\/(paypal-toolkit|payments-help)\//.test(rel(x)))) {
      expect(code(f), rel(f)).not.toMatch(/from\s+["'][^"']*(checkout|gateway|refund|guardian|rules\/save|\.\.\/paypal["'])/);
      expect(code(f), rel(f)).not.toMatch(/requestApproval|withApproval|\.update\(/);
    }
  });

  it("the payments agent has only look-up tools", () => {
    const text = code(path.join(SRC, "lib/agents/payments/payments.ts"));
    const names = [...text.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(["account_activity", "my_recent_orders", "order_status", "submit_answer"]);
  });
});
