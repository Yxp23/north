import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Proves the charge step can't be reached from anywhere except guarded checkout.
const SRC = path.resolve(__dirname, "../..");
const ROOT = path.resolve(SRC, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx|mjs|js)$/.test(name) ? [full] : [];
  });
}
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const sources = files(SRC).filter((f) => !f.endsWith(".test.ts")).map((f) => ({ file: rel(f), text: readFileSync(f, "utf8") }));
const using = (needle: string) => sources.filter((s) => s.text.includes(needle)).map((s) => s.file).sort();

describe("the charge step is only reachable through guarded checkout", () => {
  it("only the PayPal gateway calls createOrderWithVault", () => {
    expect(using("createOrderWithVault")).toEqual(["lib/checkout/gateway.ts", "lib/paypal.ts"]);
  });

  it("only run.ts imports the real gateway", () => {
    const importers = sources.filter((s) => /from\s+["'][^"']*\/gateway["']/.test(s.text)).map((s) => s.file);
    expect(importers).toEqual(["lib/checkout/run.ts"]);
  });

  it("only checkout.ts calls the gateway's charge, and it does so inside withApproval", () => {
    const callers = sources.filter((s) => /gateway\.charge\(/.test(s.text)).map((s) => s.file);
    expect(callers).toEqual(["lib/checkout/checkout.ts"]);
    const text = sources.find((s) => s.file === "lib/checkout/checkout.ts")!.text;
    expect(text).toMatch(/withApproval\(gate\.approval,[\s\S]*?gateway\.charge\(/);
  });

  it("API routes reach checkout only through runCheckout", () => {
    const routes = sources.filter((s) => s.file.startsWith("app/"));
    for (const r of routes) {
      expect(r.text).not.toMatch(/gateway|createOrderWithVault|chargeSaved/);
    }
    expect(routes.filter((r) => r.text.includes("runCheckout")).map((r) => r.file)).toEqual(["app/api/checkout/route.ts"]);
  });

  it("the old unguarded saved-account route is gone", () => {
    expect(sources.some((s) => s.file.includes("charge-saved"))).toBe(false);
  });

  // No PayPal order can be created except by createOrderWithVault, which only guarded checkout reaches.
  it("the PayPal orders endpoint appears only inside src/lib/paypal.ts (also checking scripts)", () => {
    const everything = [
      ...sources.map((s) => ({ file: `src/${s.file}`, text: s.text })),
      ...files(path.join(ROOT, "scripts")).map((f) => ({ file: path.relative(ROOT, f), text: readFileSync(f, "utf8") })),
    ];
    const hits = everything.filter((s) => s.text.includes("checkout/orders")).map((s) => s.file);
    expect(hits).toEqual(["src/lib/paypal.ts"]);
  });

  it("inside paypal.ts, only createOrderWithVault creates an order", () => {
    const text = sources.find((s) => s.file === "lib/paypal.ts")!.text;
    const creates = [...text.matchAll(/call\(\s*"POST",\s*["`]\/v2\/checkout\/orders["`]/g)];
    expect(creates).toHaveLength(1);
    const fn = text.slice(text.indexOf("export async function createOrderWithVault"));
    const end = fn.indexOf("\nexport ", 10);
    expect(fn.slice(0, end === -1 ? undefined : end)).toMatch(/call\(\s*"POST",\s*"\/v2\/checkout\/orders"/);
  });

  it("nothing calls PayPal's order-capture or order-create from routes or pages", () => {
    for (const r of sources.filter((s) => s.file.startsWith("app/"))) {
      expect(r.text).not.toMatch(/captureOrder|createOrder|checkout\/orders/);
    }
  });

  it("the spike pages and their routes are gone", () => {
    expect(sources.some((s) => /(^|\/)spike\//.test(s.file))).toBe(false);
    expect(sources.some((s) => s.file.includes("create-order") || s.file.includes("capture-order"))).toBe(false);
  });
});

// ---- Hardening (Nov 8): the single choke point -------------------------------------------------------------
describe("the PayPal money calls sit behind a signed Guardian approval", () => {
  const text = (f: string) => sources.find((s) => s.file === f)!.text;

  it("the three money functions are called only from the gateway files", () => {
    expect(using("captureOrder(")).toEqual(["lib/checkout/gateway.ts", "lib/paypal.ts"]);
    expect(using("refundCapture(")).toEqual(["lib/paypal.ts", "lib/refund/run.ts"]);
    expect(using("createOrderWithVault(")).toEqual(["lib/checkout/gateway.ts", "lib/paypal.ts"]);
  });

  it("each money function begins by requiring a verified proof", () => {
    const paypal = text("lib/paypal.ts");
    for (const name of ["captureOrder", "createOrderWithVault", "refundCapture"]) {
      const start = paypal.indexOf(`export async function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const body = paypal.slice(start, start + 400);
      expect(body, name).toMatch(/requireVerified\(proof, "(charge|refund)"\)/);
    }
  });

  it("the amount and currency PayPal receives come from the verified proof, not from other arguments", () => {
    const paypal = text("lib/paypal.ts");
    const create = paypal.slice(paypal.indexOf("export async function createOrderWithVault"), paypal.indexOf("export async function refundCapture"));
    expect(create).toContain("money(claims.amountCents, claims.currency)");
    expect(create).not.toMatch(/amount: string|amountCents: number/);
  });

  it("only paypal.ts can send a request that moves money: the generic PayPal caller is private", () => {
    const paypal = text("lib/paypal.ts");
    expect(paypal).not.toMatch(/export (async )?function call\b|export const call\b/);
    // Every POST that moves money lives inside one of the three guarded functions.
    for (const path of ["/v2/checkout/orders", "/v2/payments/captures", "/capture`"]) {
      const lines = paypal.split("\n").filter((l) => l.includes(path) && l.includes("call("));
      for (const l of lines) expect(l, path).toMatch(/call\("POST"/);
    }
    const money = (paypal.match(/call\(\s*"POST",\s*[`"]\/v2\/(checkout|payments)/g) ?? []).length;
    expect(money).toBe(3);
  });

  it("a VerifiedMoney can only be made by authorizeMoney (guardian/authorize.ts)", () => {
    expect(using("issued.add(")).toEqual(["lib/guardian/authorize.ts"]);
    expect(using("requireVerified(")).toEqual(["lib/guardian/authorize.ts", "lib/paypal.ts"]);
  });

  it("only the gateway files call authorizeMoney", () => {
    // (seed-gateway.ts is the demo week's practice payments: it checks the very same signed approval and then records a DEMO- order. It never calls PayPal.)
    expect(using("authorizeMoney(")).toEqual(["lib/checkout/gateway.ts", "lib/demo/seed-gateway.ts", "lib/guardian/authorize.ts", "lib/refund/run.ts"]);
  });

  it("the demo week's practice payments never touch PayPal, and only the demo seed uses them", () => {
    const gw = sources.find((s) => s.file === "lib/demo/seed-gateway.ts")!.text;
    expect(gw).not.toMatch(/from\s+["'][^"']*\/paypal["']|fetch\(|createOrderWithVault|captureOrder|refundCapture/);
    expect(gw).toContain("DEMO-ORDER-");
    const users = sources.filter((s) => /seed-gateway["']/.test(s.text)).map((s) => s.file);
    expect(users).toEqual(["lib/demo/seed-week.ts"]);
    // and the seed refuses anyone but the practice account before it does anything
    expect(sources.find((s) => s.file === "lib/demo/seed-week.ts")!.text).toMatch(/if \(!demoAllowed\(deps\.userId\)\) throw/);
    // no web route builds the seed's gateway: routes only call runDemoWeek
    for (const r of sources.filter((x) => x.file.startsWith("app/"))) expect(r.text).not.toMatch(/seed-gateway|createSeedGateway|createSeedRefundGateway/);
  });

  it("approvals are signed only where the Guardian or a refund is decided", () => {
    expect(using("signClaims(")).toEqual(["lib/guardian/approval.ts", "lib/guardian/signed.ts", "lib/refund/refund.ts"]);
  });

  it("nothing else talks to PayPal's money endpoints with fetch", () => {
    const hits = sources.filter((s) => /api-m\.(sandbox\.)?paypal\.com/.test(s.text)).map((s) => s.file);
    expect(hits).toEqual(["lib/paypal.ts"]);
  });

  it("the PayPal Agent Toolkit stays read-only (it can't be used to create orders or refunds)", () => {
    const reader = text("lib/paypal-toolkit/reader.ts");
    expect(reader).toContain('ALLOWED_METHODS = ["get_order", "list_transactions"]');
    expect(reader).toContain("({ orders: { get: true }, transactions: { list: true } })");
    // No money-moving permission is ever switched on.
    expect(reader).not.toMatch(/(create|capture|pay|refund|update|send|cancel)\s*:\s*true/);
  });

  it("scripts do not call the PayPal money endpoints directly", () => {
    const scripts = files(path.join(ROOT, "scripts")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(scripts).not.toMatch(/\/v2\/checkout\/orders|\/v2\/payments\/captures/);
  });
});
