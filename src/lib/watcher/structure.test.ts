import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The Price Watcher can only NOTIFY. It never buys. These checks keep it that way.
const SRC = path.resolve(__dirname, "../..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
  });
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const watcherFiles = files(SRC).filter((f) => !/\.test\.tsx?$/.test(f) && (/^lib\/watcher\//.test(rel(f)) || /^lib\/agents\/watcher\//.test(rel(f)) || /^app\/api\/watch\//.test(rel(f))));

describe("the Price Watcher only notifies", () => {
  it("there are watcher files to check", () => {
    expect(watcherFiles.length).toBeGreaterThanOrEqual(8);
  });

  it("nothing in it imports checkout, the PayPal gateway, refunds, the Guardian's approval, or saving rules", () => {
    for (const f of watcherFiles) {
      const imports = [...code(f).matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) expect(spec, `${rel(f)} imports ${spec}`).not.toMatch(/checkout|gateway|refund|rules\/(save|change)|connect|paypal(?!-)|agent-toolkit|guardian/i);
      expect(code(f), rel(f)).not.toMatch(/requestApproval|withApproval/);
    }
  });

  it("it only ever writes watches, notices and the audit log: no purchases, no waiting list, no rules, no PayPal token", () => {
    for (const f of watcherFiles) {
      const text = code(f);
      expect(text, rel(f)).not.toMatch(/\.purchases\.push|\.waitingList\.push|paypalVault\s*=|\.rules\.\w+\s*=|markPaid|flagSeller/);
    }
  });

  it("the agent has only two tools: look at a price history, and say what to tell the user", () => {
    const names = [...code(path.join(SRC, "lib/agents/watcher/watcher.ts")).matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(["price_history", "submit_decisions"]);
  });

  it("the scheduled check can't be started without the secret", () => {
    const text = code(path.join(SRC, "app/api/watch/run/route.ts"));
    expect(text).toMatch(/isCronAuthorized\(/);
  });
});
