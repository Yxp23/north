import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The demo assistant stands in for an OUTSIDE agent. It may reach North only through the MCP link.
const DIR = __dirname;
const sources = readdirSync(DIR).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)).map((f) => ({ file: f, text: readFileSync(path.join(DIR, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1") }));

describe("the demo assistant is outside North", () => {
  it("there are files to check", () => expect(sources.length).toBeGreaterThanOrEqual(3));
  it("it imports no ledger, store, checkout, Guardian, PayPal or checkpoint code: only the MCP client and the shared agent loop", () => {
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
        expect(m[1], `${file} imports ${m[1]}`).not.toMatch(/ledger|store|checkout|guardian|paypal|checkpoint|proposals|rules\//i);
      }
    }
  });
  it("it never touches a PayPal token or the Guardian", () => {
    for (const { file, text } of sources) expect(text, file).not.toMatch(/vaultId|requestApproval|withApproval|\bdecide\(/);
  });
});
