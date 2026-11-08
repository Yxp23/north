import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { TEST_IDENTITY } from "../../../test/checkout-identity";
import { TEST_USER_ID } from "../../../test/user";
import { checkRequest } from "../auth/check";
import { CSRF_HEADER, SESSION_COOKIE } from "../auth/cookies";
import { csrfFor, issueSession } from "../auth/session";
import { checkout, type PayGateway } from "../checkout/checkout";
import { parseCheckoutBody } from "../checkout/request";
import { connectAgent, revokeAgent } from "../checkpoint/keys";
import { createCheckpointHandler } from "../checkpoint/mcp";
import type { CheckpointDeps } from "../checkpoint/service";
import { MemoryLedger } from "../ledger/ledger";
import { MemoryRateLimiter } from "../ratelimit/limiter";
import { DemoStore } from "../store/demo-store";

// EVERY ATTACK THAT MATTERED, replayed on every test run, with no AI and no network. The attacker (attacker/run.mts) and the
// human and AI reviewers add entries to attacker/corpus/*.json. Each entry says what was sent and what must NEVER happen.
type McpEntry = { id: string; kind: "mcp"; why: string; fixture?: "locked" | "gentle"; agent: "A" | "R" | "revoked" | "none" | "custom"; customKey?: string; calls: { tool: string; arguments?: unknown }[]; expect: "no_purchase" };
type CheckoutEntry = { id: string; kind: "checkout"; why: string; fixture?: "locked" | "gentle"; bodies: unknown[]; demoOn?: boolean; expect: "no_purchase" | "at_most_one_purchase" | "within_max"; maxCents?: number };
type WebEntry = { id: string; kind: "web"; why: string; session: "csrf_missing" | "cross_site" | "anonymous" | "forged"; method: string; origin?: string };
type Entry = McpEntry | CheckoutEntry | WebEntry;

const dir = path.resolve(__dirname, "../../../attacker/corpus");
const entries: Entry[] = readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Entry[]);
const NOON = new Date("2026-11-04T17:00:00Z");
const HOUR = 3_600_000;

async function world(fixture: "locked" | "gentle" = "locked") {
  const ledger = new MemoryLedger("America/New_York", () => NOON);
  const charge = vi.fn<PayGateway["charge"]>(async (a) => ({ ok: true, orderId: `O-${a.customId}`, captureId: `C-${a.customId}`, status: "COMPLETED" }));
  let n = 0;
  const store = new DemoStore();
  const deps: CheckpointDeps = {
    ledger, store, now: () => NOON, newId: () => `id${++n}`,
    checkout: (input, onStep) => checkout(input, { ...TEST_IDENTITY, ledger, store, gateway: { charge }, getVaultId: async () => "V", now: () => NOON, newId: () => `pur_${++n}`, onStep }),
  };
  const keys: Record<string, string> = {};
  await ledger.update((d) => {
    d.paypalVault = { vaultId: "V", savedAt: NOON.toISOString() };
    if (fixture === "locked") d.rules.waitOverCents = { value: { cents: 100, strength: "locked" }, previous: null, changedAt: new Date(NOON.getTime() - 40 * 24 * HOUR).toISOString() };
    for (const [name, scopes] of [["A", undefined], ["R", ["read_rules", "read_week_money"] as never], ["revoked", undefined]] as const) {
      const r = connectAgent(d, `Agent ${name}`, NOON, () => `agt_${name}`, TEST_USER_ID, scopes);
      if (r.ok) keys[name] = r.key;
    }
    revokeAgent(d, "agt_revoked", NOON);
  });
  const handler = createCheckpointHandler(async (uid) => (uid === TEST_USER_ID ? deps : null), new MemoryRateLimiter());
  const connect = async (key: string | null) => {
    const c = new Client({ name: "replay", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL("http://north.test/api/mcp"), {
      fetch: (url: string | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key !== null) h.set("Authorization", `Bearer ${key}`);
        return handler(new Request(url, { ...init, headers: h }));
      },
    }));
    return c;
  };
  return { ledger, charge, keys, connect };
}

describe("the attack corpus", () => {
  it("has attacks in it (so this test can't pass by finding nothing)", () => {
    expect(entries.length).toBeGreaterThan(10);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  for (const e of entries.filter((x): x is McpEntry => x.kind === "mcp")) {
    it(`[mcp] ${e.id}: ${e.why}`, async () => {
      const w = await world(e.fixture);
      const key = e.agent === "none" ? null : e.agent === "custom" ? e.customKey ?? "" : w.keys[e.agent];
      let client: Client | null = null;
      try { client = await w.connect(key); } catch { /* turned away at the door: fine */ }
      for (const call of e.calls) {
        if (!client) break;
        await client.callTool({ name: call.tool, arguments: (call.arguments ?? {}) as Record<string, unknown> }).catch(() => undefined);
      }
      expect(w.charge).not.toHaveBeenCalled();
      expect((await w.ledger.read()).purchases).toHaveLength(0);
    });
  }

  for (const e of entries.filter((x): x is CheckoutEntry => x.kind === "checkout")) {
    it(`[checkout] ${e.id}: ${e.why}`, async () => {
      const w = await world(e.fixture);
      const d = (await w.ledger.read());
      void d;
      const store = new DemoStore();
      const deps = { ...TEST_IDENTITY, ledger: w.ledger, store, gateway: { charge: w.charge }, getVaultId: async () => "V", now: () => NOON, newId: (() => { let i = 0; return () => `pur_${++i}`; })() };
      await Promise.all(e.bodies.map(async (b) => {
        const p = parseCheckoutBody(b, { demoOn: e.demoOn ?? true });
        if (p.ok) await checkout(p.input, deps).catch(() => undefined);
      }));
      const bought = (await w.ledger.read()).purchases.filter((p) => p.status === "paid" || p.status === "pending");
      if (e.expect === "no_purchase") expect(bought).toHaveLength(0);
      else if (e.expect === "at_most_one_purchase") expect(bought.length).toBeLessThanOrEqual(1);
      if (e.maxCents !== undefined) expect(bought.reduce((n, p) => n + p.amountCents, 0)).toBeLessThanOrEqual(e.maxCents);
    });
  }

  for (const e of entries.filter((x): x is WebEntry => x.kind === "web")) {
    it(`[web] ${e.id}: ${e.why}`, () => {
      const keys = { session: Buffer.from("s".repeat(32)), csrf: Buffer.from("c".repeat(32)) };
      const now = Date.now();
      const s = issueSession(TEST_USER_ID, now, keys.session);
      const base = "https://north.example/api/x";
      const headers: Record<string, string> = {};
      if (e.session === "csrf_missing") Object.assign(headers, { cookie: `${SESSION_COOKIE}=${s.token}`, origin: "https://north.example" });
      if (e.session === "cross_site") Object.assign(headers, { cookie: `${SESSION_COOKIE}=${s.token}`, origin: e.origin ?? "https://evil.example", [CSRF_HEADER]: csrfFor(s.sessionId, keys.csrf) });
      if (e.session === "forged") Object.assign(headers, { cookie: `${SESSION_COOKIE}=forged.value.here`, origin: "https://north.example" });
      const v = checkRequest({ method: e.method, url: base, headers: { get: (n) => headers[n.toLowerCase()] ?? null } }, keys, now);
      expect(v.ok).toBe(false);
    });
  }
});
