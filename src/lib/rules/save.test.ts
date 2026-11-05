import { describe, expect, it } from "vitest";
import { saveRules } from "./save";
import { effective } from "../guardian";
import { MemoryLedger } from "../ledger/ledger";
import { buildUserState } from "../ledger/logic";
import type { SaveRule } from "./types";

const NOW = new Date("2026-11-05T15:00:00Z");
const HOUR = 3_600_000;

function setup() {
  const ledger = new MemoryLedger("America/New_York", () => NOW);
  let clock = NOW;
  const deps = { ledger, now: () => clock };
  return { ledger, deps, setClock: (d: Date) => void (clock = d) };
}
// Demo rules: over $50 gentle, after 9pm firm 24h.
const big = (cents: number, strength: SaveRule["strength"], waitHours?: number): SaveRule => ({ kind: "big_buy", cents, strength, ...(waitHours ? { waitHours } : {}) });
const night = (afterHour: number, strength: SaveRule["strength"], untilHour = 5, waitHours?: number): SaveRule => ({ kind: "late_night", afterHour, untilHour, strength, ...(waitHours ? { waitHours } : {}) });

describe("saving a stricter rule starts right away", () => {
  it("a tighter rule counts at once (no waiting day)", async () => {
    const { ledger, deps } = setup();
    const r = await saveRules({ rules: [big(3000, "firm", 24)] }, deps);
    expect(r).toMatchObject({ ok: true });
    const d = await ledger.read();
    expect(d.rules.waitOverCents).toEqual({
      value: { cents: 3000, strength: "firm", waitHours: 24 },
      changedAt: new Date(NOW.getTime() - 24 * HOUR).toISOString(), // already past its first day
      previous: { cents: 5000, strength: "gentle" },
      askedAt: NOW.toISOString(),
    });
    const rule = buildUserState(d, NOW).rules.waitOverCents;
    expect(effective(rule, NOW)).toMatchObject({ cents: 3000, strength: "firm" });
  });

  it("tells the user it started now", async () => {
    const { deps } = setup();
    const r = await saveRules({ rules: [big(3000, "gentle")] }, deps);
    if (!r.ok) throw new Error("expected ok");
    expect(r.saved).toHaveLength(1);
    expect(r.saved[0]).toMatchObject({ startsAt: NOW.toISOString(), startsNow: true });
    expect(r.saved[0].text).toBe("Wait on buys over $30. You can still tap Buy now.");
    expect(r.message).toBe("Saved. It starts now.");
  });

  it("a brand-new rule starts at once too", async () => {
    const { ledger, deps } = setup();
    await ledger.update((d) => void (d.rules.waitOverCents = { value: null, changedAt: "2026-10-01T00:00:00.000Z", previous: null }));
    await saveRules({ rules: [big(2000, "locked")] }, deps);
    const rule = buildUserState(await ledger.read(), NOW).rules.waitOverCents;
    expect(effective(rule, NOW)).toMatchObject({ cents: 2000, strength: "locked" });
  });

  it("asking again for the rule that is in force cancels a change that is waiting", async () => {
    const { ledger, deps } = setup();
    // The user asked (by hand) to turn the $50 rule off an hour ago. It is still in force for now.
    await ledger.update((d) => void (d.rules.waitOverCents = { value: null, changedAt: new Date(NOW.getTime() - HOUR).toISOString(), previous: { cents: 5000, strength: "gentle" } }));
    const r = await saveRules({ rules: [big(5000, "gentle")] }, deps);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.saved).toHaveLength(1);
    const rule = buildUserState(await ledger.read(), NOW).rules.waitOverCents;
    expect(rule.value).toMatchObject({ cents: 5000 });
    expect(effective(rule, new Date(NOW.getTime() + 30 * HOUR))).toMatchObject({ cents: 5000 }); // the turn-off is gone
  });

  it("saves a late-night rule and a big-buy rule together", async () => {
    const { ledger, deps } = setup();
    const r = await saveRules({ rules: [big(4000, "firm"), night(20, "locked")] }, deps);
    expect(r).toMatchObject({ ok: true });
    const d = await ledger.read();
    expect(d.rules.waitOverCents.value).toMatchObject({ cents: 4000, strength: "firm" });
    expect(d.rules.waitAfterHour.value).toMatchObject({ afterHour: 20, untilHour: 5, strength: "locked" });
  });

  it("a second, stricter change just replaces the first", async () => {
    const { ledger, deps, setClock } = setup();
    await saveRules({ rules: [big(4000, "gentle")] }, deps);
    setClock(new Date(NOW.getTime() + 2 * HOUR));
    await saveRules({ rules: [big(3000, "gentle")] }, deps);
    const w = (await ledger.read()).rules.waitOverCents;
    expect(w.value).toMatchObject({ cents: 3000 });
    expect(w.previous).toMatchObject({ cents: 4000 });
  });

  it("writes what it did to the audit log in plain words", async () => {
    const { ledger, deps } = setup();
    await saveRules({ rules: [big(3000, "firm")] }, deps);
    const entry = (await ledger.read()).audit.find((a) => a.type === "rule_change");
    expect(entry?.detail).toMatch(/Wait a day on buys over \$30/);
  });

  it("leaves the budget, the protected money and the must-have list alone", async () => {
    const { ledger, deps } = setup();
    const before = await ledger.read();
    await saveRules({ rules: [big(3000, "locked")] }, deps);
    const after = await ledger.read();
    expect(after.weeklyBudgetCents).toBe(before.weeklyBudgetCents);
    expect(after.protectedCents).toBe(before.protectedCents);
    expect(after.rules.essentials).toEqual(before.rules.essentials);
  });
});

describe("it can never loosen a rule", () => {
  it.each([
    ["a higher amount", big(9000, "gentle")],
    ["a weaker strength on the same amount", night(21, "gentle")],
    ["a shorter night window", night(23, "firm", 5, 24)],
    ["a shorter firm wait", night(21, "firm", 5, 12)],
  ])("rejects %s, and saves nothing", async (_n, rule) => {
    const { ledger, deps } = setup();
    const before = JSON.stringify((await ledger.read()).rules);
    const r = await saveRules({ rules: [rule] }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/only make rules stricter/);
    expect(JSON.stringify((await ledger.read()).rules)).toBe(before);
  });

  it("is all or nothing: one tighter rule and one looser rule saves neither", async () => {
    const { ledger, deps } = setup();
    const before = JSON.stringify((await ledger.read()).rules);
    const r = await saveRules({ rules: [big(3000, "gentle"), night(23, "firm", 5, 24)] }, deps);
    expect(r.ok).toBe(false);
    expect(JSON.stringify((await ledger.read()).rules)).toBe(before);
  });

  it("a rule that is already exactly what you have is not saved again", async () => {
    const { ledger, deps } = setup();
    const r = await saveRules({ rules: [big(5000, "gentle")] }, deps);
    expect(r).toMatchObject({ ok: true, saved: [] });
    if (r.ok) expect(r.message).toBe("You already have that rule.");
    expect((await ledger.read()).rules.waitOverCents.changedAt).not.toBe(NOW.toISOString());
  });

  it("can't use a pending loosening to go lower: it compares with what is in force too", async () => {
    const { ledger, deps } = setup();
    // Locked is in force. An hour ago the user asked (by hand) to make it gentle. That is still waiting.
    await ledger.update((d) => void (d.rules.waitOverCents = { value: { cents: 5000, strength: "gentle" }, changedAt: new Date(NOW.getTime() - HOUR).toISOString(), previous: { cents: 5000, strength: "locked" } }));
    // Asking the Concierge for gentle again must still be refused: locked is in force.
    const r = await saveRules({ rules: [big(5000, "gentle")] }, deps);
    expect(r.ok).toBe(false);
  });
});

describe("what the browser sends is checked again", () => {
  it.each([
    ["an unknown kind", { kind: "never_buy_shoes", strength: "locked" }],
    ["a negative amount", { kind: "big_buy", cents: -5, strength: "locked" }],
    ["a fraction of a cent", { kind: "big_buy", cents: 10.5, strength: "locked" }],
    ["a huge amount", { kind: "big_buy", cents: 99_999_999_999, strength: "locked" }],
    ["an unknown strength", { kind: "big_buy", cents: 1000, strength: "super" }],
    ["no strength", { kind: "big_buy", cents: 1000 }],
    ["an hour of 25", { kind: "late_night", afterHour: 25, untilHour: 5, strength: "firm" }],
    ["a window with the same start and end", { kind: "late_night", afterHour: 5, untilHour: 5, strength: "firm" }],
    ["a 500-hour wait", { kind: "big_buy", cents: 1000, strength: "firm", waitHours: 500 }],
    ["an extra field", { kind: "big_buy", cents: 1000, strength: "firm", approve: true }],
  ])("rejects %s", async (_n, rule) => {
    const { ledger, deps } = setup();
    const before = JSON.stringify((await ledger.read()).rules);
    const r = await saveRules({ rules: [rule] } as never, deps);
    expect(r.ok).toBe(false);
    expect(JSON.stringify((await ledger.read()).rules)).toBe(before);
  });

  it("rejects two rules of the same kind in one request", async () => {
    const { deps } = setup();
    expect((await saveRules({ rules: [big(3000, "firm"), big(2000, "firm")] }, deps)).ok).toBe(false);
  });

  it("rejects an empty request and a request that is not an object", async () => {
    const { deps } = setup();
    expect((await saveRules({ rules: [] }, deps)).ok).toBe(false);
    expect((await saveRules(null as never, deps)).ok).toBe(false);
    expect((await saveRules("rules" as never, deps)).ok).toBe(false);
  });

  it("drops a wait time that does not apply (gentle and locked rules have none)", async () => {
    const { ledger, deps } = setup();
    await saveRules({ rules: [big(3000, "gentle", 48)] }, deps);
    expect((await ledger.read()).rules.waitOverCents.value).toEqual({ cents: 3000, strength: "gentle" });
  });
});

describe("two saves at the same moment", () => {
  it("are checked one after the other against fresh data", async () => {
    const { ledger, deps } = setup();
    const [a, b] = await Promise.all([saveRules({ rules: [big(3000, "gentle")] }, deps), saveRules({ rules: [big(4000, "gentle")] }, deps)]);
    // Whichever ran second is looser than the first, so it must be refused.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((await ledger.read()).rules.waitOverCents.value).toMatchObject({ cents: 3000 });
  });
});
