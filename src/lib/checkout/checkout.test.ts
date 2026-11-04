import { describe, expect, it, vi } from "vitest";
import { checkout, type CheckoutDeps, type PayGateway } from "./checkout";
import { MemoryLedger } from "../ledger/ledger";
import { applyWebhook, buildUserState } from "../ledger/logic";
import { DemoStore } from "../store/demo-store";

const NOTEBOOK = "Qez8uoD"; // $2.50
const SHAMPOO = "cY1jWjp"; // $9.70, "personal care" (an essential)
const HEADPHONES = "ENVDwLq"; // $349.00
const SNEAKERS = "OpovWAw"; // $72.54

const NOON = new Date("2026-11-04T17:00:00Z"); // 12:00 PM in New York
const ELEVEN_PM = new Date("2026-11-05T04:00:00Z"); // 11:00 PM Nov 4 in New York

function setup(opts: { vault?: string | null; gateway?: Partial<PayGateway> } = {}) {
  const charge = vi.fn<PayGateway["charge"]>(async (a) => ({ ok: true, orderId: `ORD-${a.customId}`, captureId: `CAP-${a.customId}`, status: "COMPLETED" }));
  const gateway: PayGateway = { charge, ...opts.gateway };
  const ledger = new MemoryLedger("America/New_York", () => NOON);
  let n = 0;
  const deps: CheckoutDeps = {
    ledger,
    store: new DemoStore(),
    gateway,
    getVaultId: async () => (opts.vault === undefined ? "VAULT-1" : opts.vault),
    now: () => NOON,
    newId: () => `pur_${++n}`,
  };
  let a = 0;
  const buy = (productId: string, extra: Partial<Parameters<typeof checkout>[0]> = {}) =>
    checkout({ productId, attemptId: `attempt-${++a}`, ...extra }, deps);
  return { charge, ledger, deps, buy };
}

describe("approve goes to the saved-PayPal charge", () => {
  it("pays a cheap item with no popup, using the store price", async () => {
    const { charge, buy, ledger } = setup();
    const out = await buy(NOTEBOOK);
    expect(out.kind).toBe("paid");
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge.mock.calls[0][0]).toMatchObject({ vaultId: "VAULT-1", amountCents: 250, currency: "USD", customId: "pur_1" });
    const d = await ledger.read();
    expect(d.purchases[0]).toMatchObject({ status: "paid", amountCents: 250, captureId: "CAP-pur_1", paidVia: "checkout" });
    expect(d.audit.some((e) => e.type === "decision")).toBe(true);
  });

  it("uses the attempt id as the PayPal request id, so a retry can't charge twice", async () => {
    const { charge, buy } = setup();
    await buy(NOTEBOOK);
    expect(charge.mock.calls[0][0].requestId).toBe("attempt-1");
  });

  it("an essential at 11 PM is approved", async () => {
    const { buy } = setup();
    expect((await buy(SHAMPOO, { at: ELEVEN_PM })).kind).toBe("paid");
  });
});

describe("wait shows Wait / Buy now and does not charge", () => {
  it("the $349 headphones wait at 11 PM", async () => {
    const { charge, buy, ledger } = setup();
    const out = await buy(HEADPHONES, { at: ELEVEN_PM });
    expect(out.kind).toBe("wait");
    if (out.kind === "wait") {
      expect(out.result.canOverride).toBe(true);
      expect(out.result.reason).toContain("Wait, or buy now?");
    }
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });

  it("Buy now then pays", async () => {
    const { charge, buy } = setup();
    const out = await buy(HEADPHONES, { at: ELEVEN_PM, overrideWait: true });
    expect(out.kind).toBe("paid");
    expect(charge.mock.calls[0][0].amountCents).toBe(34_900);
  });

  it("a wait does not need PayPal to be connected", async () => {
    const { buy } = setup({ vault: null });
    expect((await buy(HEADPHONES, { at: ELEVEN_PM })).kind).toBe("wait");
  });
});

describe("refuse shows the reason and never charges", () => {
  async function afterHeadphones() {
    const s = setup();
    await s.buy(HEADPHONES, { at: ELEVEN_PM, overrideWait: true }); // leaves $51 spendable
    s.charge.mockClear();
    return s;
  }

  it("refuses something over the protected money", async () => {
    const { buy, charge } = await afterHeadphones();
    const out = await buy(SNEAKERS, { at: NOON });
    expect(out.kind).toBe("refused");
    if (out.kind === "refused") expect(out.result.code).toBe("protected_money");
    expect(charge).not.toHaveBeenCalled();
  });

  it("Buy now can't override a refuse", async () => {
    const { buy, charge } = await afterHeadphones();
    const out = await buy(SNEAKERS, { at: NOON, overrideWait: true });
    expect(out.kind).toBe("refused");
    expect(charge).not.toHaveBeenCalled();
  });
});

describe("other outcomes", () => {
  it("says so when the product is unknown, and charges nothing", async () => {
    const { buy, charge } = setup();
    expect((await buy("nope")).kind).toBe("not_found");
    expect(charge).not.toHaveBeenCalled();
  });

  it("asks for PayPal when approved but nothing is saved, and records no buy", async () => {
    const { buy, charge, ledger } = setup({ vault: null });
    expect((await buy(NOTEBOOK)).kind).toBe("needs_paypal");
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });

  it("a PayPal failure counts as no spending", async () => {
    const { buy, ledger } = setup({ gateway: { charge: async () => ({ ok: false, error: "declined" }) } });
    const out = await buy(NOTEBOOK);
    expect(out.kind).toBe("failed");
    const d = await ledger.read();
    expect(d.purchases[0]).toMatchObject({ status: "failed", failureReason: "declined" });
    expect(buildUserState(d, NOON).spentThisWeekCents).toBe(0);
  });

  it("a PayPal crash counts as failed, and a later webhook can fix it to paid", async () => {
    const { buy, ledger } = setup({ gateway: { charge: async () => { throw new Error("network"); } } });
    expect((await buy(NOTEBOOK)).kind).toBe("failed");
    await ledger.update((d) =>
      applyWebhook(d, { kind: "completed", eventId: "E1", captureId: "C9", customId: "pur_1" }, NOON),
    );
    expect((await ledger.read()).purchases[0].status).toBe("paid");
  });
});

describe("taps and races", () => {
  it("a repeated tap with the same attempt id charges once", async () => {
    const { deps, charge } = setup();
    const input = { productId: NOTEBOOK, attemptId: "same" };
    const first = await checkout(input, deps);
    const second = await checkout(input, deps);
    expect(first.kind).toBe("paid");
    expect(second.kind).toBe("paid");
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("two taps at the same moment still charge once", async () => {
    const { deps, charge } = setup();
    const input = { productId: NOTEBOOK, attemptId: "same" };
    await Promise.all([checkout(input, deps), checkout(input, deps)]);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("two big buys at the same moment can't both spend the same money", async () => {
    const { buy, charge } = setup();
    const outs = await Promise.all([
      buy(HEADPHONES, { at: ELEVEN_PM, overrideWait: true }),
      buy(HEADPHONES, { at: ELEVEN_PM, overrideWait: true }),
    ]);
    expect(outs.map((o) => o.kind).sort()).toEqual(["paid", "refused"]);
    expect(charge).toHaveBeenCalledTimes(1);
  });
});
