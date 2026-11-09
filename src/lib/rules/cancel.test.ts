import { describe, expect, it } from "vitest";
import { changeRule } from "./change";
import { effective } from "../guardian";
import { MemoryLedger } from "../ledger/ledger";
import { buildUserState } from "../ledger/logic";

// "Undo this change": a change that has not started yet can be dropped. The rule becomes exactly what is in force now, so it is never weaker.
const NOW = new Date("2026-11-05T15:00:00Z");
const HOUR = 3_600_000;
const setup = () => {
  const ledger = new MemoryLedger("America/New_York", () => NOW);
  return { ledger, deps: { ledger, now: () => NOW } };
};
const big = async (l: MemoryLedger, at: Date) => effective(buildUserState(await l.read(), at).rules.waitOverCents, at);

describe("cancelling a change that has not started", () => {
  it("a weaker change is dropped: the old rule stays, now and after the day would have passed", async () => {
    const { ledger, deps } = setup();
    await changeRule({ action: "set", rule: { kind: "big_buy", cents: 9000, strength: "gentle" } }, deps);
    const r = await changeRule({ action: "cancel", kind: "big_buy" }, deps);
    expect(r).toMatchObject({ ok: true, changed: true });
    expect(await big(ledger, NOW)).toMatchObject({ cents: 5000 });
    expect(await big(ledger, new Date(NOW.getTime() + 48 * HOUR))).toMatchObject({ cents: 5000 });
  });

  it("a pending turn-off is dropped: the rule stays on", async () => {
    const { ledger, deps } = setup();
    await changeRule({ action: "remove", kind: "big_buy" }, deps);
    await changeRule({ action: "cancel", kind: "big_buy" }, deps);
    expect(await big(ledger, new Date(NOW.getTime() + 48 * HOUR))).toMatchObject({ cents: 5000 });
  });

  it("with nothing waiting it changes nothing", async () => {
    const { ledger, deps } = setup();
    const before = JSON.stringify((await ledger.read()).rules);
    const r = await changeRule({ action: "cancel", kind: "late_night" }, deps);
    expect(r).toMatchObject({ ok: true, changed: false });
    expect(JSON.stringify((await ledger.read()).rules)).toBe(before);
  });

  it("is written in the audit log, and never makes a rule weaker than it was", async () => {
    const { ledger, deps } = setup();
    await changeRule({ action: "set", rule: { kind: "big_buy", cents: 3000, strength: "locked" } }, deps); // stricter: starts at once
    await changeRule({ action: "set", rule: { kind: "big_buy", cents: 9000, strength: "gentle" } }, deps); // weaker: waits a day
    await changeRule({ action: "cancel", kind: "big_buy" }, deps);
    expect(await big(ledger, new Date(NOW.getTime() + 48 * HOUR))).toMatchObject({ cents: 3000, strength: "locked" });
    expect((await ledger.read()).audit.some((a) => a.type === "rule_change_cancelled")).toBe(true);
  });
});
