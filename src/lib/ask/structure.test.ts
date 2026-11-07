import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Ask North only routes. It can't move money.
const SRC = path.resolve(__dirname, "../..");
const code = (r: string) => readFileSync(path.join(SRC, r), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Ask North can't move money", () => {
  it("the route imports only the existing helper routes, the router, and plumbing: no checkout, gateway, PayPal, ledger writes or Guardian", () => {
    const text = code("app/api/ask/route.ts");
    for (const m of text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
      expect(m[1], `ask route imports ${m[1]}`).not.toMatch(/checkout|gateway|paypal|ledger|guardian|checkpoint|refund|rules\/(save|change)/i);
    }
    expect(text).not.toMatch(/runCheckout|\.update\(|requestApproval|withApproval/);
  });
  it("the helpers it can reach are exactly the four existing read-only or notify-only ones", () => {
    const text = code("app/api/ask/route.ts");
    const routes = [...text.matchAll(/import \{ POST as \w+ \} from "(@\/app\/api\/[^"]+)"/g)].map((m) => m[1]).sort();
    expect(routes).toEqual(["@/app/api/choose/route", "@/app/api/concierge/payments/route", "@/app/api/deal-check/route", "@/app/api/find/route"]);
  });
  it("the router passes nothing on but a destination, and the person's own words go to the helper", () => {
    expect(code("lib/agents/concierge/router.ts")).toMatch(/destination: z\.enum\(DESTINATIONS\)\s*\}\)\.strict\(\)/);
    expect(code("lib/ask/ask.ts")).toMatch(/delegates\[destination\]\(\{ text, imageBase64: image\?\.base64/);
  });
});
