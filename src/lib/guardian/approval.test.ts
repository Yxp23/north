import { describe, expect, it, vi } from "vitest";
import { NotApprovedError, requestApproval, withApproval, type Approval, type Purchase, type UserState } from "./index";

const NOW = new Date("2026-11-05T15:00:00Z");
const settled = <T,>(value: T) => ({ value, changedAt: new Date("2026-10-01T00:00:00Z"), previous: null as T | null });

const state: UserState = {
  balanceCents: 160_000,
  protectedCents: 120_000,
  weeklyBudgetCents: 40_000,
  spentThisWeekCents: 0,
  timeZone: "UTC",
  rules: {
    waitOverCents: settled({ cents: 5000, strength: "gentle" as const }),
    waitAfterHour: settled({ afterHour: 22, untilHour: 5, strength: "gentle" as const }),
    essentials: settled(["household"]),
  },
};
const buy = (over: Partial<Purchase> = {}): Purchase => ({
  amountCents: 250, item: "Notebook", category: "school and office", at: NOW, ...over,
});

describe("requestApproval", () => {
  it("gives an approval only when the Guardian says approve", () => {
    const { result, approval } = requestApproval(buy(), state);
    expect(result.decision).toBe("approve");
    expect(approval).not.toBeNull();
  });

  it("gives no approval for a wait", () => {
    const { result, approval } = requestApproval(buy({ amountCents: 34_900 }), state);
    expect(result.decision).toBe("wait");
    expect(approval).toBeNull();
  });

  it("gives no approval for a refuse", () => {
    const { result, approval } = requestApproval(buy({ amountCents: 90_000 }), state);
    expect(result.decision).toBe("refuse");
    expect(approval).toBeNull();
  });

  it("gives an approval after Buy now on a wait", () => {
    const { result, approval } = requestApproval(buy({ amountCents: 34_900, overrideWait: true }), state);
    expect(result.code).toBe("ok_override");
    expect(approval).not.toBeNull();
  });

  it("never gives an approval after Buy now on a refuse", () => {
    const { approval } = requestApproval(buy({ amountCents: 90_000, overrideWait: true }), state);
    expect(approval).toBeNull();
  });
});

// These tests prove the charge step cannot run without a real Guardian approval.
describe("withApproval (the only door to the charge step)", () => {
  it("runs the charge once with the approved purchase", async () => {
    const charge = vi.fn(async (p: Purchase) => p.amountCents);
    const { approval } = requestApproval(buy(), state);
    expect(await withApproval(approval!, charge)).toBe(250);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("refuses a forged approval and never runs the charge", async () => {
    const charge = vi.fn();
    const forged = { purchase: buy(), result: { decision: "approve", code: "ok" } } as unknown as Approval;
    await expect(withApproval(forged, charge)).rejects.toBeInstanceOf(NotApprovedError);
    expect(charge).not.toHaveBeenCalled();
  });

  it("refuses a copy of a real approval", async () => {
    const charge = vi.fn();
    const { approval } = requestApproval(buy(), state);
    const copy = { ...approval! } as Approval;
    await expect(withApproval(copy, charge)).rejects.toBeInstanceOf(NotApprovedError);
    expect(charge).not.toHaveBeenCalled();
  });

  it("refuses null and undefined", async () => {
    const charge = vi.fn();
    await expect(withApproval(null as unknown as Approval, charge)).rejects.toBeInstanceOf(NotApprovedError);
    await expect(withApproval(undefined as unknown as Approval, charge)).rejects.toBeInstanceOf(NotApprovedError);
    expect(charge).not.toHaveBeenCalled();
  });

  it("works only once, so one approval can't charge twice", async () => {
    const charge = vi.fn(async () => "ok");
    const { approval } = requestApproval(buy(), state);
    await withApproval(approval!, charge);
    await expect(withApproval(approval!, charge)).rejects.toBeInstanceOf(NotApprovedError);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("charges the approved amount even if someone edits the approval afterwards", async () => {
    const seen: number[] = [];
    const { approval } = requestApproval(buy({ amountCents: 250 }), state);
    try {
      (approval!.purchase as { amountCents: number }).amountCents = 9_999_999;
    } catch {
      /* a frozen object may throw in strict mode, which is fine */
    }
    await withApproval(approval!, async (p) => void seen.push(p.amountCents));
    expect(seen).toEqual([250]);
  });
});
