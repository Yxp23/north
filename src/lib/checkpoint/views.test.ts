import { describe, expect, it } from "vitest";
import { defaultLedgerData } from "../ledger/logic";
import { connectAgent, revokeAgent } from "./keys";
import { assistantsView } from "./views";

const NOW = new Date("2026-11-08T15:00:00Z");

function withData() {
  const d = defaultLedgerData(NOW, "America/New_York");
  const a = connectAgent(d, "Any AI assistant", NOW, () => "agt_1");
  const b = connectAgent(d, "Old one", NOW, () => "agt_2");
  if (!a.ok || !b.ok) throw new Error("setup");
  revokeAgent(d, "agt_2", NOW);
  d.agentCheckpoint.requests.push({
    id: "req_1", agentId: "agt_1", agentName: "Any AI assistant", productId: "P", name: "Warm Socks", imageUrl: "https://x/y.png", unitCents: 1100, quantity: 1, amountCents: 1100,
    reason: "You asked.", decision: "approve", guardianCode: "ok", guardianReason: "ok", needsPerson: true, needsOverride: false, status: "pending", createdAt: NOW.toISOString(), steps: [{ label: "An assistant asked." }],
  });
  return { d, a, b };
}

describe("what the My rules screen shows about assistants", () => {
  it("connected assistants only, with no key and no hash", () => {
    const { d, a } = withData();
    const v = assistantsView(d, NOW);
    expect(v.agents.map((x) => x.name)).toEqual(["Any AI assistant"]);
    const json = JSON.stringify(v);
    expect(json).not.toContain("keyHash");
    if (a.ok) expect(json).not.toContain(a.key);
    expect(json).not.toMatch(/[0-9a-f]{64}/);
  });
  it("the permission in plain words, and what is in force", () => {
    const { d } = withData();
    expect(assistantsView(d, NOW).permission).toMatchObject({ words: "Your assistant must ask you every time.", underCents: null });
  });
  it("a permission change that is waiting says when it starts", () => {
    const { d } = withData();
    d.agentCheckpoint.permission = { value: { underCents: 1500 }, changedAt: NOW.toISOString(), previous: null };
    const p = assistantsView(d, NOW).permission;
    expect(p.underCents).toBeNull();
    expect(p.pending).toEqual({ underCents: 1500, startsAt: new Date(NOW.getTime() + 24 * 3_600_000).toISOString() });
  });
  it("recent requests, newest first, with their steps for the activity panel", () => {
    const { d } = withData();
    const v = assistantsView(d, NOW);
    expect(v.requests).toHaveLength(1);
    expect(v.requests[0]).toMatchObject({ id: "req_1", name: "Warm Socks", status: "pending", steps: [{ label: "An assistant asked." }] });
  });
  it("a request nobody answered for a day shows as expired", () => {
    const { d } = withData();
    expect(assistantsView(d, new Date(NOW.getTime() + 25 * 3_600_000)).requests[0].status).toBe("expired");
  });
});
