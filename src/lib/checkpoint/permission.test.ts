import { describe, expect, it } from "vitest";
import { defaultLedgerData } from "../ledger/logic";
import { assistantAllowance, assistantTiming, changeAssistantPermission, MAX_AUTO_CENTS, permissionInWords } from "./permission";

const NOW = new Date("2026-11-08T15:00:00Z");
const HOUR = 3_600_000;
const fresh = () => defaultLedgerData(NOW, "America/New_York");

describe("what an assistant may do without asking", () => {
  it("by default: nothing. It asks me every time.", () => {
    const d = fresh();
    expect(assistantAllowance(d, NOW)).toBeNull();
    expect(permissionInWords(d, NOW)).toBe("Your assistant must ask you every time.");
  });

  it("when does a change start? More freedom waits a day; less starts at once", () => {
    expect(assistantTiming(null, { underCents: 1500 })).toBe("in_a_day"); // turning it on
    expect(assistantTiming({ underCents: 1500 }, { underCents: 3000 })).toBe("in_a_day"); // a higher amount
    expect(assistantTiming({ underCents: 1500 }, { underCents: 1000 })).toBe("now"); // a lower amount
    expect(assistantTiming({ underCents: 1500 }, { underCents: 1500 })).toBe("now");
    expect(assistantTiming({ underCents: 1500 }, null)).toBe("now"); // back to asking every time
    expect(assistantTiming(null, null)).toBe("now");
  });

  it("turning it ON starts in a day, and until then the assistant still has to ask", () => {
    const d = fresh();
    const r = changeAssistantPermission(d, { underCents: 1500 }, NOW);
    expect(r).toMatchObject({ ok: true, changed: true, startsNow: false });
    expect(assistantAllowance(d, NOW)).toBeNull();
    expect(assistantAllowance(d, new Date(NOW.getTime() + 23 * HOUR))).toBeNull();
    expect(assistantAllowance(d, new Date(NOW.getTime() + 24 * HOUR))).toEqual({ underCents: 1500 });
    expect(permissionInWords(d, NOW)).toMatch(/must ask you every time.*A change is waiting.*\$15/);
  });

  it("asking every time again starts at once, and cancels a change that was waiting", () => {
    const d = fresh();
    changeAssistantPermission(d, { underCents: 1500 }, NOW);
    const r = changeAssistantPermission(d, null, new Date(NOW.getTime() + HOUR));
    expect(r).toMatchObject({ ok: true, startsNow: true });
    expect(assistantAllowance(d, new Date(NOW.getTime() + 48 * HOUR))).toBeNull();
  });

  it("lowering the amount starts at once; raising it waits a day, and until then the lower amount stays", () => {
    const d = fresh();
    d.agentCheckpoint.permission = { value: { underCents: 2000 }, changedAt: new Date(NOW.getTime() - 48 * HOUR).toISOString(), previous: null };
    changeAssistantPermission(d, { underCents: 1000 }, NOW);
    expect(assistantAllowance(d, NOW)).toEqual({ underCents: 1000 });
    changeAssistantPermission(d, { underCents: 5000 }, NOW);
    expect(assistantAllowance(d, NOW)).toEqual({ underCents: 1000 }); // the stricter one stays for a day
    expect(assistantAllowance(d, new Date(NOW.getTime() + 25 * HOUR))).toEqual({ underCents: 5000 });
  });

  it("says plainly what is allowed once it is on", () => {
    const d = fresh();
    d.agentCheckpoint.permission = { value: { underCents: 1500 }, changedAt: new Date(NOW.getTime() - 48 * HOUR).toISOString(), previous: null };
    expect(permissionInWords(d, NOW)).toBe("Your assistant can buy must-have things under $15 without asking. Everything else, it asks you first.");
  });

  it.each([0, 50, -5, MAX_AUTO_CENTS + 1, 12.5, Number.NaN])("a limit of %s is not allowed", (underCents) => {
    const d = fresh();
    expect(changeAssistantPermission(d, { underCents }, NOW)).toMatchObject({ ok: false });
    expect(d.agentCheckpoint.permission.value).toBeNull();
  });

  it("changing to what it already is changes nothing", () => {
    const d = fresh();
    expect(changeAssistantPermission(d, null, NOW)).toMatchObject({ ok: true, changed: false });
  });
});
