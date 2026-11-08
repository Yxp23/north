import { TEST_USER_ID } from "../../../test/user";
import { describe, expect, it } from "vitest";
import { defaultLedgerData } from "../ledger/logic";
import { authenticateAgent, can, cleanScopes, connectAgent, hashKey, newAgentKey, parseAgentKey, revokeAgent, scopesOf, MAX_ACTIVE_AGENTS } from "./keys";

const NOW = new Date("2026-11-08T15:00:00Z");
const fresh = () => defaultLedgerData(NOW, "America/New_York");
let n = 0;
const newId = () => `agt_${++n}`;

describe("an assistant's key", () => {
  it("is long and random, and different every time", () => {
    const a = newAgentKey(TEST_USER_ID);
    const b = newAgentKey(TEST_USER_ID);
    expect(a).toMatch(/^north_[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  it("names its owner, so the checkpoint knows whose ledger to look in (and nothing else is learned from it)", () => {
    const key = newAgentKey(TEST_USER_ID);
    expect(parseAgentKey(`Bearer ${key}`)).toEqual({ key, userId: TEST_USER_ID });
    expect(key).not.toContain(TEST_USER_ID); // the dashes are gone: it is only an address, not a secret
  });
  it.each([
    [null], [undefined], [""], ["north_x"], ["Bearer"], ["Bearer "], ["Basic abc"], ["Bearer north_short.abc"],
    ["Bearer north_6b1f5b2e9f434a2d8b6e0c9f1d2a3b4c.tooShort"], ["Bearer north_ZZZZ5b2e9f434a2d8b6e0c9f1d2a3b4c." + "A".repeat(43)],
    ["Bearer north_6b1f5b2e9f434a2d8b6e0c9f1d2a3b4c." + "A".repeat(43) + " extra"], ["bearer " + "x".repeat(500)],
  ])("a header that is not shaped like a key (%j) names nobody", (h) => {
    expect(parseAgentKey(h as string)).toBeNull();
  });
  it("is stored only as a hash", () => {
    const d = fresh();
    const { agent, key } = connectAgent(d, "Any AI assistant", NOW, newId, TEST_USER_ID) as { agent: { keyHash: string }; key: string };
    expect(agent.keyHash).toBe(hashKey(key));
    expect(agent.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(d)).not.toContain(key);
  });
});

describe("connecting an assistant", () => {
  it("gives it its own key, shown now and never kept", () => {
    const d = fresh();
    const r = connectAgent(d, "  Any AI assistant ", NOW, newId, TEST_USER_ID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.agent).toMatchObject({ name: "Any AI assistant", createdAt: NOW.toISOString() });
      expect(d.agentCheckpoint.agents).toHaveLength(1);
    }
  });
  it("two assistants get two different keys", () => {
    const d = fresh();
    const a = connectAgent(d, "One", NOW, newId, TEST_USER_ID);
    const b = connectAgent(d, "Two", NOW, newId, TEST_USER_ID);
    if (a.ok && b.ok) expect(a.key).not.toBe(b.key);
  });
  it.each(["", "   ", "x".repeat(41), "<b>hi</b>", "visit https://x.example"])("rejects the name %j", (name) => {
    expect(connectAgent(fresh(), name, NOW, newId, TEST_USER_ID).ok).toBe(false);
  });
  it("won't connect too many at once, but a disconnected one doesn't count", () => {
    const d = fresh();
    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_AGENTS; i++) {
      const r = connectAgent(d, `A${i}`, NOW, newId, TEST_USER_ID);
      if (r.ok) ids.push(r.agent.id);
    }
    expect(connectAgent(d, "One too many", NOW, newId, TEST_USER_ID).ok).toBe(false);
    revokeAgent(d, ids[0], NOW);
    expect(connectAgent(d, "Now there is room", NOW, newId, TEST_USER_ID).ok).toBe(true);
  });
});

describe("checking a key", () => {
  const setup = () => {
    const d = fresh();
    const r = connectAgent(d, "Any AI assistant", NOW, newId, TEST_USER_ID);
    if (!r.ok) throw new Error("setup");
    return { d, key: r.key, agent: r.agent };
  };
  it("a connected assistant's key works, as 'Bearer <key>'", () => {
    const { d, key, agent } = setup();
    expect(authenticateAgent(d, `Bearer ${key}`)?.id).toBe(agent.id);
  });
  it.each([["no header", null], ["empty", ""], ["not bearer", "Basic abc"], ["wrong key", "Bearer north_nope"], ["a key with extra", "Bearer X"]])("%s fails", (_n, header) => {
    const { d } = setup();
    expect(authenticateAgent(d, header)).toBeNull();
  });
  it("a disconnected assistant's key fails at once", () => {
    const { d, key, agent } = setup();
    expect(revokeAgent(d, agent.id, NOW)).toBe(true);
    expect(authenticateAgent(d, `Bearer ${key}`)).toBeNull();
  });
  it("one assistant's key is not another's", () => {
    const d = fresh();
    const a = connectAgent(d, "A", NOW, newId, TEST_USER_ID);
    const b = connectAgent(d, "B", NOW, newId, TEST_USER_ID);
    if (a.ok && b.ok) {
      expect(authenticateAgent(d, `Bearer ${a.key}`)?.id).toBe(a.agent.id);
      expect(authenticateAgent(d, `Bearer ${b.key}`)?.id).toBe(b.agent.id);
    }
  });
  it("disconnecting twice is harmless, and an unknown id says so", () => {
    const { d, agent } = setup();
    expect(revokeAgent(d, agent.id, NOW)).toBe(true);
    expect(revokeAgent(d, agent.id, new Date(NOW.getTime() + 1000))).toBe(true);
    expect(d.agentCheckpoint.agents[0].revokedAt).toBe(NOW.toISOString()); // the first time stays
    expect(revokeAgent(d, "nope", NOW)).toBe(false);
  });
});

describe("what an assistant may do (scopes)", () => {
  it("a new assistant gets what was picked, and asking to buy comes with checking on its own asks", () => {
    const r = connectAgent(fresh(), "Reader", NOW, newId, TEST_USER_ID, ["request_purchase"]);
    expect(r.ok && r.agent.scopes).toEqual(["request_purchase", "read_status"]);
  });
  it("by default it may do all four things", () => {
    const r = connectAgent(fresh(), "All", NOW, newId, TEST_USER_ID);
    expect(r.ok && r.agent.scopes).toEqual(["request_purchase", "read_rules", "read_week_money", "read_status"]);
  });
  it("an assistant made before scopes existed may do all four (what it could always do)", () => {
    expect(scopesOf({})).toEqual(["request_purchase", "read_rules", "read_week_money", "read_status"]);
    expect(can({}, "request_purchase")).toBe(true);
    expect(can({ scopes: ["read_rules"] }, "request_purchase")).toBe(false);
  });
  it.each([[[]], [["pay"]], [["request_purchase", "pay"]], ["request_purchase"], [null], [{}], [["read_rules", "read_rules", "read_rules", "read_rules", "read_rules"]]])("a bad list of scopes (%j) is refused", (s) => {
    expect(cleanScopes(s)).toBeNull();
    expect(connectAgent(fresh(), "Bad", NOW, newId, TEST_USER_ID, s as never).ok).toBe(false);
  });
  it("duplicates are merged", () => {
    expect(cleanScopes(["read_rules", "read_rules"])).toEqual(["read_rules"]);
  });
});
