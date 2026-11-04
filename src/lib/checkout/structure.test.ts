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
    const fn = text.slice(text.indexOf("export function createOrderWithVault"));
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
