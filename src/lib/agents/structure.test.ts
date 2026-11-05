import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Agents never move money. Only the Guardian approves. These checks keep it that way.
const SRC = path.resolve(__dirname, "../..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
  });
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const agentFiles = files(path.join(SRC, "lib/agents")).filter((f) => !f.endsWith(".test.ts")).map((f) => ({ file: rel(f), text: readFileSync(f, "utf8") }));

// Everything an agent could use to reach money, the ledger, or a way to save rules.
const FORBIDDEN_IMPORTS = [
  /checkout/, /paypal/i, /gateway/, /refund/, /store\b/, /ledger/, /rules\/(save|change)/, /connect/, /spike/,
];

describe("agent code can't reach money", () => {
  it("there are agent files to check", () => {
    expect(agentFiles.length).toBeGreaterThan(3);
  });

  it("no agent file imports checkout, PayPal, the ledger, refunds, the store, or the save step", () => {
    for (const { file, text } of agentFiles) {
      const imports = [...text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        for (const bad of FORBIDDEN_IMPORTS) {
          if (file.endsWith("run.ts") && /ledger|rules\/(save|change)/.test(spec)) continue; // the server wiring file is the only bridge (checked below)
          expect(spec, `${file} imports ${spec}`).not.toMatch(bad);
        }
      }
    }
  });

  it("the only agent file that touches the ledger is the server wiring (run.ts), and it only READS it", () => {
    const bridges = agentFiles.filter((f) => /ledger/.test(f.text.replace(/\/\/.*$/gm, "")));
    expect(bridges.map((b) => b.file).sort()).toEqual(["lib/agents/concierge/run.ts"]);
    const text = bridges[0].text;
    expect(text).not.toMatch(/\.update\(/);
    expect(text).not.toMatch(/\.reset\(/);
  });

  it("no agent tool is named like a money action", () => {
    for (const { file, text } of agentFiles) {
      for (const m of text.matchAll(/name:\s*"([a-z_]+)"/g)) {
        expect(m[1], `${file} defines a tool called ${m[1]}`).not.toMatch(/pay|charge|buy|checkout|refund|approve|send|transfer|spend/i);
      }
    }
  });

  it("agents never import the Guardian's decide or approval functions", () => {
    for (const { file, text } of agentFiles) {
      expect(text, file).not.toMatch(/requestApproval|withApproval|\bdecide\b/);
    }
  });
});

describe("the save step is reached only by a user's confirmed request", () => {
  it("rules/save is imported only by its own tests and the /api/rules route", () => {
    const all = files(SRC).filter((f) => !f.endsWith(".test.ts"));
    // `import type` is erased when building, so it carries no code. Only real imports count.
    const real = /^import\s+(?!type\b)[^;]*from\s+["'][^"']*(?:rules\/save|\.\/save)["']/m;
    const importers = all.filter((f) => real.test(readFileSync(f, "utf8"))).map(rel);
    expect(importers.sort()).toEqual(["app/api/rules/route.ts"]);
  });
});

describe("changing or removing a rule by hand is reached only by the user's own tap", () => {
  it("rules/change is imported only by its own tests and the /api/rules/change route", () => {
    const all = files(SRC).filter((f) => !f.endsWith(".test.ts"));
    const real = /^import\s+(?!type\b)[^;]*from\s+["'][^"']*(?:rules\/change|\.\/change)["']/m;
    const importers = all.filter((f) => real.test(readFileSync(f, "utf8"))).map(rel);
    expect(importers.sort()).toEqual(["app/api/rules/change/route.ts"]);
  });

  it("no agent file mentions it at all", () => {
    for (const { file, text } of agentFiles) expect(text, file).not.toMatch(/changeRule|rules\/change/);
  });
});
