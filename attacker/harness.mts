// The attacker's hands. It talks to a RUNNING North over real HTTP, the way any outsider (or any website, or any AI assistant)
// could, and keeps track of what the person's ledger looks like so the oracle can say whether anything got through.
//
// Who the attacker can be:
//   person        the logged-in person's own browser session (cookie + CSRF token + same-origin): the strongest web position
//   csrf_missing  a stolen/riding cookie with no CSRF token
//   cross_site    the cookie and token, but the request says it came from another website
//   anonymous     no login at all
//   forged        a cookie value the attacker made up
//   assistants    A (full), R (read-only), revoked (was disconnected), or any text as a key
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { evaluate, type Baseline, type Snapshot, type Verdict } from "./oracle.mts";

export type Session = "person" | "csrf_missing" | "cross_site" | "anonymous" | "forged";
export type WebCall = { session: Session; method: string; path: string; headers?: Record<string, string>; json?: unknown; rawBody?: string; forgedCookie?: string };
export type McpCall = { agent: "A" | "R" | "revoked" | "none" | "custom"; customKey?: string; tool: string; arguments?: unknown };
export type RawMcpCall = { authorization?: string; body: string; headers?: Record<string, string> };
export type Reply = { status: number; text: string };

const ALLOWED_HEADERS = new Set(["content-type", "origin", "referer", "x-forwarded-for", "x-north-csrf", "authorization", "accept", "sec-fetch-site", "x-forwarded-host", "host-override"]);
const clip = (s: string, n = 1400) => (s.length > n ? s.slice(0, n) + `… (${s.length - n} more characters)` : s);

export class Harness {
  cookie = "";
  csrf = "";
  keys: Record<"A" | "R" | "revoked", string> = { A: "", R: "", revoked: "" };
  baseline!: Baseline;
  sent = 0;

  constructor(readonly base: string, private readonly email: string, private readonly password: string) {}
  get origin() { return new URL(this.base).origin; }

  async login() {
    const res = await fetch(`${this.base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: this.origin }, body: JSON.stringify({ email: this.email, password: this.password }) });
    if (!res.ok) throw new Error(`Could not log in (${res.status}): ${await res.text()}`);
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    this.cookie = set.join("; ");
    this.csrf = set.find((c) => c.startsWith("north_csrf="))?.slice("north_csrf=".length) ?? "";
  }

  /** What the PERSON can do (set-up and the oracle). Not an attack. */
  private async asPerson(path: string, init: { method?: string; json?: unknown } = {}) {
    const method = init.method ?? "GET";
    const headers: Record<string, string> = { Cookie: this.cookie };
    if (method !== "GET") Object.assign(headers, { Origin: this.origin, "x-north-csrf": this.csrf, "Content-Type": "application/json" });
    const res = await fetch(`${this.base}${path}`, { method, headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  }

  /** Back to a known start: reset, a fixture of rules, three assistants (one disconnected). */
  async setup(fixture: "locked" | "gentle") {
    await this.asPerson("/api/demo/reset", { method: "POST" });
    if (fixture === "locked") {
      // Stricter than the starting rule (a lower amount, a stronger strength), so it starts at once: nothing over $1 except must-haves.
      const r = await this.asPerson("/api/rules/change", { method: "POST", json: { action: "set", rule: { kind: "big_buy", cents: 100, strength: "locked" } } });
      if (r.status !== 200) throw new Error(`Could not set the fixture rule: ${r.text}`);
    }
    for (const [name, scopes] of [["A", undefined], ["R", ["read_rules", "read_week_money"]], ["revoked", undefined]] as const) {
      const r = await this.asPerson("/api/agents", { method: "POST", json: { action: "connect", name: `Attacker ${name}`, ...(scopes ? { scopes } : {}) } });
      const j = r.json as { key?: string; id?: string };
      if (!j?.key) throw new Error(`Could not connect assistant ${name}: ${r.text}`);
      this.keys[name] = j.key;
      if (name === "revoked") await this.asPerson("/api/agents", { method: "POST", json: { action: "revoke", id: j.id } });
    }
    const snap = await this.snapshot();
    const products = ((await this.asPerson("/api/products")).json as { products?: { id: string; priceCents: number }[] })?.products ?? [];
    const essentials = ((snap.rules.essentials.value ?? []) as string[]);
    this.baseline = {
      purchaseIds: new Set(snap.purchases.map((p) => p.id)),
      essentials,
      unitPrices: Object.fromEntries(products.map((p) => [p.id, p.priceCents])),
      fixture,
      rules: structuredClone(snap.rules),
      nowMs: Date.now(),
    };
  }

  async snapshot(): Promise<Snapshot> {
    const r = await this.asPerson("/api/demo/ledger");
    if (r.status !== 200) throw new Error(`Could not read the ledger for the oracle (${r.status}). Is the server running with demo tools on?`);
    return r.json as Snapshot;
  }

  async verdict(): Promise<Verdict> {
    return evaluate(await this.snapshot(), this.baseline);
  }

  // ---- the attacks -------------------------------------------------------------------------------------------------
  async web(c: WebCall): Promise<Reply> {
    this.sent++;
    const method = c.method.toUpperCase();
    if (!/^\/(api\/|login$|$)/.test(c.path)) return { status: 0, text: "The attacker may only aim at this North's own /api paths." };
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(method)) return { status: 0, text: "Unknown method." };
    // "Start over" erases the whole test (that is its job, for the demo account only) and is not part of what is being tested.
    if (c.path.split("?")[0].replace(/\/+$/, "") === "/api/demo/reset" && method !== "GET" && method !== "HEAD") return { status: 0, text: "Skipped by the test harness: the demo 'Start over' erases the test itself and is out of scope." };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.headers ?? {})) if (ALLOWED_HEADERS.has(k.toLowerCase()) && typeof v === "string" && v.length < 4000) headers[k.toLowerCase()] = v;
    const body = c.rawBody ?? (c.json === undefined ? undefined : JSON.stringify(c.json));
    if (body && body.length > 60_000) return { status: 0, text: "Body too long for this harness." };
    if (body !== undefined && !headers["content-type"]) headers["content-type"] = "application/json";
    // The test's person NEVER says yes to an assistant's card. (If the attacker could use the person's own session to tap Yes, that
    // would be the person saying yes, which is allowed and not an attack. Other kinds of caller may try: that would be a real hole.)
    if (c.session === "person" && /^\/api\/agents\/?$/.test(c.path.split("?")[0]) && /"answer"\s*:\s*"yes"/i.test(body ?? "")) {
      return { status: 0, text: "Skipped by the test harness: in this test the person never taps Yes on an assistant's card, so that is not an attack." };
    }
    switch (c.session) {
      case "person": headers.cookie = this.cookie; headers.origin ??= this.origin; headers["x-north-csrf"] ??= this.csrf; break;
      case "csrf_missing": headers.cookie = this.cookie; headers.origin ??= this.origin; break;
      case "cross_site": headers.cookie = this.cookie; headers.origin = "https://evil.example"; headers["x-north-csrf"] ??= this.csrf; break;
      case "forged": headers.cookie = c.forgedCookie ?? "north_session=forged"; headers.origin ??= this.origin; break;
      case "anonymous": break;
    }
    try {
      const res = await fetch(`${this.base}${c.path}`, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : body, redirect: "manual" });
      return { status: res.status, text: clip(await res.text()) };
    } catch (e) {
      return { status: 0, text: `Network error: ${e instanceof Error ? e.message : e}` };
    }
  }

  private keyFor(c: McpCall): string | null {
    if (c.agent === "none") return null;
    if (c.agent === "custom") return c.customKey ?? "";
    return this.keys[c.agent];
  }

  async mcp(c: McpCall): Promise<Reply> {
    this.sent++;
    const key = this.keyFor(c);
    const client = new Client({ name: "attacker", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${this.base}/api/mcp`), { requestInit: key === null ? {} : { headers: { Authorization: `Bearer ${key}` } } }));
    } catch (e) {
      return { status: 401, text: `Could not connect: ${e instanceof Error ? e.message.slice(0, 200) : e}` };
    }
    try {
      if (c.tool === "__list_tools") return { status: 200, text: JSON.stringify((await client.listTools()).tools.map((t) => t.name)) };
      const r = await client.callTool({ name: c.tool, arguments: (c.arguments ?? {}) as Record<string, unknown> });
      const text = ((r.content ?? []) as { text?: string }[]).map((x) => x.text ?? "").join("\n");
      return { status: r.isError ? 400 : 200, text: clip(text) };
    } catch (e) {
      return { status: 400, text: `Tool error: ${e instanceof Error ? e.message.slice(0, 300) : e}` };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async mcpRaw(c: RawMcpCall): Promise<Reply> {
    this.sent++;
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    for (const [k, v] of Object.entries(c.headers ?? {})) if (ALLOWED_HEADERS.has(k.toLowerCase()) && typeof v === "string" && v.length < 4000) headers[k.toLowerCase()] = v;
    if (c.authorization !== undefined) headers.authorization = c.authorization;
    if (c.body.length > 60_000) return { status: 0, text: "Body too long for this harness." };
    try {
      const res = await fetch(`${this.base}/api/mcp`, { method: "POST", headers, body: c.body });
      return { status: res.status, text: clip(await res.text()) };
    } catch (e) {
      return { status: 0, text: `Network error: ${e instanceof Error ? e.message : e}` };
    }
  }

  /** The assistant's key, for attacks that need the real key text (to mangle it). */
  keyText(which: "A" | "R" | "revoked") { return this.keys[which]; }
}
