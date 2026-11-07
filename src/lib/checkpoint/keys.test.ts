import { describe, expect, it } from "vitest";
import { defaultLedgerData } from "../ledger/logic";
import { authenticateAgent, connectAgent, hashKey, newAgentKey, revokeAgent, MAX_ACTIVE_AGENTS } from "./keys";

const NOW = new Date("2026-11-08T15:00:00Z");
const fresh = () => defaultLedgerData(NOW, "America/New_York");
let n = 0;
const newId = () => `agt_${++n}`;

describe("an assistant's key", () => {
  it("is long and random, and different every time", () => {
    const a = newAgentKey();
    const b = newAgentKey();
    expect(a).toMatch(/^north_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  it("is stored only as a hash", () => {
    const d = fresh();
    const { agent, key } = connectAgent(d, "Any AI assistant", NOW, newId) as { agent: { keyHash: string }; key: string };
    expect(agent.keyHash).toBe(hashKey(key));
    expect(agent.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(d)).not.toContain(key);
  });
});

describe("connecting an assistant", () => {
  it("gives it its own key, shown now and never kept", () => {
    const d = fresh();
    const r = connectAgent(d, "  Any AI assistant ", NOW, newId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.agent).toMatchObject({ name: "Any AI assistant", createdAt: NOW.toISOString() });
      expect(d.agentCheckpoint.agents).toHaveLength(1);
    }
  });
  it("two assistants get two different keys", () => {
    const d = fresh();
    const a = connectAgent(d, "One", NOW, newId);
    const b = connectAgent(d, "Two", NOW, newId);
    if (a.ok && b.ok) expect(a.key).not.toBe(b.key);
  });
  it.each(["", "   ", "x".repeat(41), "<b>hi</b>", "visit https://x.example"])("rejects the name %j", (name) => {
    expect(connectAgent(fresh(), name, NOW, newId).ok).toBe(false);
  });
  it("won't connect too many at once, but a disconnected one doesn't count", () => {
    const d = fresh();
    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_AGENTS; i++) {
      const r = connectAgent(d, `A${i}`, NOW, newId);
      if (r.ok) ids.push(r.agent.id);
    }
    expect(connectAgent(d, "One too many", NOW, newId).ok).toBe(false);
    revokeAgent(d, ids[0], NOW);
    expect(connectAgent(d, "Now there is room", NOW, newId).ok).toBe(true);
  });
});

describe("checking a key", () => {
  const setup = () => {
    const d = fresh();
    const r = connectAgent(d, "Any AI assistant", NOW, newId);
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
    const a = connectAgent(d, "A", NOW, newId);
    const b = connectAgent(d, "B", NOW, newId);
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
