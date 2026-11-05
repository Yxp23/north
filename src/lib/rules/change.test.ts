import { describe, expect, it } from "vitest";
import { changeRule } from "./change";
import { effective } from "../guardian";
import { MemoryLedger } from "../ledger/ledger";
import { buildUserState } from "../ledger/logic";

// By-hand changes ("Change or remove a rule"). No AI is involved here. Tighter starts now; weaker or off waits a day.
const NOW = new Date("2026-11-05T15:00:00Z");
const HOUR = 3_600_000;

function setup() {
  const ledger = new MemoryLedger("America/New_York", () => NOW);
  let clock = NOW;
  return { ledger, deps: { ledger, now: () => clock }, setClock: (d: Date) => void (clock = d) };
}
const setBig = (cents: number, strength: "gentle" | "firm" | "locked", waitHours?: number) => ({ action: "set", rule: { kind: "big_buy", cents, strength, ...(waitHours ? { waitHours } : {}) } });
const setNight = (afterHour: number, untilHour: number, strength: "gentle" | "firm" | "locked", waitHours?: number) => ({ action: "set", rule: { kind: "late_night", afterHour, untilHour, strength, ...(waitHours ? { waitHours } : {}) } });
const remove = (kind: "big_buy" | "late_night") => ({ action: "remove", kind });

const bigNow = async (l: MemoryLedger, at: Date) => effective(buildUserState(await l.read(), at).rules.waitOverCents, at);
const nightNow = async (l: MemoryLedger, at: Date) => effective(buildUserState(await l.read(), at).rules.waitAfterHour, at);
const later = (h: number) => new Date(NOW.getTime() + h * HOUR);

describe("making a rule stricter by hand starts at once", () => {
  it("a lower amount", async () => {
    const { ledger, deps } = setup();
    const r = await changeRule(setBig(3000, "gentle"), deps);
    expect(r).toMatchObject({ ok: true, startsNow: true, message: "Saved. It starts now." });
    expect(await bigNow(ledger, NOW)).toMatchObject({ cents: 3000 });
  });

  it("a stronger strength", async () => {
    const { ledger, deps } = setup();
    await changeRule(setBig(5000, "locked"), deps);
    expect(await bigNow(ledger, NOW)).toMatchObject({ cents: 5000, strength: "locked" });
  });
});

describe("making a rule weaker by hand waits one day", () => {
  it("a higher amount: the old rule stays for 24 hours", async () => {
    const { ledger, deps } = setup();
    const r = await changeRule(setBig(9000, "gentle"), deps);
    expect(r).toMatchObject({ ok: true, startsNow: false, startsAt: later(24).toISOString() });
    if (r.ok) expect(r.message).toBe("Saved. This makes the rule weaker, so it starts in one day. Until then, your old rule stays.");
    expect(await bigNow(ledger, later(23))).toMatchObject({ cents: 5000 });
    expect(await bigNow(ledger, later(24))).toMatchObject({ cents: 9000 });
  });

  it("a weaker strength (firm to gentle on the night rule)", async () => {
    const { ledger, deps } = setup();
    await changeRule(setNight(21, 5, "gentle"), deps);
    expect(await nightNow(ledger, later(1))).toMatchObject({ strength: "firm" });
    expect(await nightNow(ledger, later(25))).toMatchObject({ strength: "gentle" });
  });

  it("a locked rule can be loosened, but only after a full day", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(setBig(5000, "locked"), deps); // tighter: at once
    setClock(later(2));
    await changeRule(setBig(5000, "gentle"), deps);
    expect(await bigNow(ledger, later(2 + 23))).toMatchObject({ strength: "locked" });
    expect(await bigNow(ledger, later(2 + 24))).toMatchObject({ strength: "gentle" });
  });

  it("a mix (lower amount, weaker strength) counts as weaker", async () => {
    const { ledger, deps } = setup();
    await changeRule(setNight(21, 5, "locked"), deps);
    await changeRule(setNight(23, 5, "locked"), deps); // shorter night
    expect(await nightNow(ledger, later(1))).toMatchObject({ afterHour: 21, strength: "locked" });
  });
});

describe("removing a rule", () => {
  it("turns it off after one day, and the rule stays until then", async () => {
    const { ledger, deps } = setup();
    const r = await changeRule(remove("big_buy"), deps);
    expect(r).toMatchObject({ ok: true, startsNow: false, removed: true, startsAt: later(24).toISOString() });
    if (r.ok) expect(r.message).toBe("Done. I will turn this rule off in one day. Until then, it stays.");
    expect(await bigNow(ledger, later(23))).toMatchObject({ cents: 5000 });
    expect(await bigNow(ledger, later(24))).toBeNull();
  });

  it("a locked rule can be removed too, after a day", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(setBig(5000, "locked"), deps);
    setClock(later(1));
    await changeRule(remove("big_buy"), deps);
    expect(await bigNow(ledger, later(1 + 23))).toMatchObject({ strength: "locked" });
    expect(await bigNow(ledger, later(1 + 24))).toBeNull();
  });

  it("asking for the rule again before it goes cancels the removal at once", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(remove("big_buy"), deps);
    setClock(later(2));
    const r = await changeRule(setBig(5000, "gentle"), deps);
    expect(r).toMatchObject({ ok: true, startsNow: true });
    expect(await bigNow(ledger, later(40))).toMatchObject({ cents: 5000 });
  });

  it("removing a rule that is already off says so, and changes nothing", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(remove("big_buy"), deps);
    setClock(later(25)); // the removal has started
    const before = JSON.stringify((await ledger.read()).rules);
    const r = await changeRule(remove("big_buy"), deps);
    expect(r).toMatchObject({ ok: true, changed: false, message: "That rule is already off." });
    expect(JSON.stringify((await ledger.read()).rules)).toBe(before);
  });

  it("removing twice does not restart the waiting day", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(remove("big_buy"), deps);
    setClock(later(10));
    const r = await changeRule(remove("big_buy"), deps);
    expect(r).toMatchObject({ ok: true, changed: false, message: "That rule is already going to turn off. Until then, it stays." });
    expect(await bigNow(ledger, later(24))).toBeNull(); // still goes at the first 24 hours
  });

  it("a new rule can be added after one was removed, and it starts at once", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(remove("big_buy"), deps);
    setClock(later(25));
    const r = await changeRule(setBig(2000, "firm", 48), deps);
    expect(r).toMatchObject({ ok: true, startsNow: true });
    expect(await bigNow(ledger, later(25))).toMatchObject({ cents: 2000, strength: "firm", waitHours: 48 });
  });
});

describe("a second change while one is waiting", () => {
  it("a new weaker ask restarts the day, but the rule in force never drops early", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(setBig(9000, "gentle"), deps);
    setClock(later(10));
    await changeRule(setBig(12000, "gentle"), deps);
    expect(await bigNow(ledger, later(10 + 23))).toMatchObject({ cents: 5000 });
    expect(await bigNow(ledger, later(10 + 24))).toMatchObject({ cents: 12000 });
  });

  it("a stricter ask replaces a waiting loosening at once", async () => {
    const { ledger, deps, setClock } = setup();
    await changeRule(setBig(9000, "gentle"), deps);
    setClock(later(3));
    await changeRule(setBig(2000, "gentle"), deps);
    expect(await bigNow(ledger, later(3))).toMatchObject({ cents: 2000 });
    expect(await bigNow(ledger, later(60))).toMatchObject({ cents: 2000 }); // the $90 never arrives
  });
});

describe("the same rule again", () => {
  it("is not saved twice", async () => {
    const { ledger, deps } = setup();
    const before = JSON.stringify((await ledger.read()).rules);
    const r = await changeRule(setBig(5000, "gentle"), deps);
    expect(r).toMatchObject({ ok: true, changed: false, message: "That is the same as your rule now." });
    expect(JSON.stringify((await ledger.read()).rules)).toBe(before);
  });
});

describe("what it leaves alone", () => {
  it("never touches the budget, protected money or the must-have list", async () => {
    const { ledger, deps } = setup();
    const before = await ledger.read();
    await changeRule(remove("big_buy"), deps);
    await changeRule(remove("late_night"), deps);
    const after = await ledger.read();
    expect(after.weeklyBudgetCents).toBe(before.weeklyBudgetCents);
    expect(after.protectedCents).toBe(before.protectedCents);
    expect(after.rules.essentials).toEqual(before.rules.essentials);
  });

  it("writes plain words to the audit log", async () => {
    const { ledger, deps } = setup();
    await changeRule(setBig(9000, "gentle"), deps);
    await changeRule(remove("late_night"), deps);
    const log = (await ledger.read()).audit.filter((a) => a.type === "rule_change").map((a) => a.detail);
    expect(log[0]).toMatch(/By hand.*\$90.*Starts in one day/);
    expect(log[1]).toMatch(/By hand.*turned off.*Starts in one day/i);
  });
});

describe("what the browser sends is checked", () => {
  it.each([
    ["nothing", null],
    ["an unknown action", { action: "approve", kind: "big_buy" }],
    ["an unknown kind", { action: "remove", kind: "budget" }],
    ["removing protected money", { action: "remove", kind: "protected_money" }],
    ["a negative amount", setBig(-5, "gentle")],
    ["no strength", { action: "set", rule: { kind: "big_buy", cents: 1000 } }],
    ["a night that starts and ends together", setNight(5, 5, "firm")],
    ["an extra field", { action: "remove", kind: "big_buy", force: true }],
  ])("rejects %s and changes nothing", async (_n, body) => {
    const { ledger, deps } = setup();
    const before = JSON.stringify((await ledger.read()).rules);
    const r = await changeRule(body as never, deps);
    expect(r.ok).toBe(false);
    expect(JSON.stringify((await ledger.read()).rules)).toBe(before);
  });
});
