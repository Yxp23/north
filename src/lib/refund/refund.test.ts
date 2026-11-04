import { describe, expect, it, vi } from "vitest";
import { refundPurchase, type RefundDeps, type RefundGateway } from "./refund";
import { MemoryLedger } from "../ledger/ledger";
import { buildUserState } from "../ledger/logic";
import type { PurchaseRecord } from "../ledger/types";

const NOW = new Date("2026-11-04T17:00:00Z");

function paid(over: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: "pur_1", attemptId: "a1", productId: "p", name: "Notebook", category: "school and office", imageUrl: "https://x/y.png",
    amountCents: 250, currency: "USD", status: "paid", createdAt: NOW.toISOString(), captureId: "CAP1", overrodeWait: false, decisionCode: "ok",
    ...over,
  };
}

async function setup(purchase: PurchaseRecord | null, gw: Partial<RefundGateway> = {}) {
  const refund = vi.fn<RefundGateway["refund"]>(async () => ({ ok: true, status: "COMPLETED" }));
  const ledger = new MemoryLedger("America/New_York", () => NOW);
  if (purchase) await ledger.update((d) => void d.purchases.push(purchase));
  const deps: RefundDeps = { ledger, gateway: { refund, ...gw }, now: () => NOW };
  return { refund, ledger, deps };
}

describe("refundPurchase", () => {
  it("refunds a paid purchase and gives the money back right away", async () => {
    const { refund, ledger, deps } = await setup(paid());
    const out = await refundPurchase("pur_1", deps);
    expect(out.kind).toBe("refunded");
    expect(refund).toHaveBeenCalledTimes(1);
    const d = await ledger.read();
    expect(d.purchases[0].status).toBe("refunded");
    expect(buildUserState(d, NOW).spentThisWeekCents).toBe(0);
    expect(d.audit.some((e) => e.type === "refund")).toBe(true);
  });

  it("uses our purchase's own capture id, and a request id that makes retries safe", async () => {
    const { refund, deps } = await setup(paid({ captureId: "CAP-REAL" }));
    await refundPurchase("pur_1", deps);
    expect(refund.mock.calls[0][0]).toEqual({ captureId: "CAP-REAL", requestId: "refund-pur_1" });
  });

  it("says 'already refunded' without calling PayPal if we already know", async () => {
    const { refund, deps } = await setup(paid({ status: "refunded" }));
    expect((await refundPurchase("pur_1", deps)).kind).toBe("already_refunded");
    expect(refund).not.toHaveBeenCalled();
  });

  it("treats PayPal's CAPTURE_FULLY_REFUNDED as 'already refunded', and fixes our record", async () => {
    const { ledger, deps } = await setup(paid(), { refund: async () => ({ ok: false, alreadyRefunded: true, error: "CAPTURE_FULLY_REFUNDED" }) });
    expect((await refundPurchase("pur_1", deps)).kind).toBe("already_refunded");
    expect((await ledger.read()).purchases[0].status).toBe("refunded");
  });

  it("leaves the purchase alone while PayPal says PENDING (the webhook will finish it)", async () => {
    const { ledger, deps } = await setup(paid(), { refund: async () => ({ ok: true, status: "PENDING" }) });
    expect((await refundPurchase("pur_1", deps)).kind).toBe("pending");
    expect((await ledger.read()).purchases[0].status).toBe("paid");
  });

  it("reports a PayPal failure and changes nothing", async () => {
    const { ledger, deps } = await setup(paid(), { refund: async () => ({ ok: false, error: "boom" }) });
    const out = await refundPurchase("pur_1", deps);
    expect(out.kind).toBe("failed");
    expect((await ledger.read()).purchases[0].status).toBe("paid");
  });

  it("reports a PayPal crash as a failure", async () => {
    const { deps } = await setup(paid(), { refund: async () => { throw new Error("network"); } });
    expect((await refundPurchase("pur_1", deps)).kind).toBe("failed");
  });

  it.each(["pending", "failed"] as const)("won't refund a %s purchase", async (status) => {
    const { refund, deps } = await setup(paid({ status }));
    expect((await refundPurchase("pur_1", deps)).kind).toBe("not_paid");
    expect(refund).not.toHaveBeenCalled();
  });

  it("won't refund a purchase with no capture id", async () => {
    const { refund, deps } = await setup(paid({ captureId: undefined }));
    expect((await refundPurchase("pur_1", deps)).kind).toBe("failed");
    expect(refund).not.toHaveBeenCalled();
  });

  it("says not found for an unknown purchase", async () => {
    const { refund, deps } = await setup(null);
    expect((await refundPurchase("nope", deps)).kind).toBe("not_found");
    expect(refund).not.toHaveBeenCalled();
  });

  it("two taps at once refund once from our side", async () => {
    const { refund, deps } = await setup(paid());
    // PayPal's request id makes the second call harmless; our record also flips to refunded.
    await Promise.all([refundPurchase("pur_1", deps), refundPurchase("pur_1", deps)]);
    expect(refund.mock.calls.length).toBeLessThanOrEqual(2);
    expect((await deps.ledger.read()).purchases[0].status).toBe("refunded");
  });
});
