import { describe, expect, it, vi } from "vitest";
import { createPaymentsBackend } from "./backend";
import type { PurchaseRecord } from "../ledger/types";

const rec = (n: number, over: Partial<PurchaseRecord> = {}): PurchaseRecord => ({
  id: `pur_${n}`, attemptId: `a${n}`, productId: "P", name: `Thing ${n}`, category: "c", imageUrl: "https://i/x.jpg", amountCents: 100 * n, currency: "USD",
  status: "paid", createdAt: `2026-11-0${n}T10:00:00.000Z`, overrodeWait: false, decisionCode: "ok", paypalOrderId: `ORDER${n}ORDER${n}ORDER${n}`.slice(0, 20), ...over,
});
const ORDER_TEXT = (id: string, value = "1.00") => JSON.stringify({ id, status: "COMPLETED", purchase_units: [{ amount: { currency_code: "USD", value }, payments: { captures: [{ status: "COMPLETED" }] } }] });

describe("the payments backend", () => {
  it("lists recent buys newest first with handles o1, o2…, at most 8", () => {
    const purchases = Array.from({ length: 9 }, (_, i) => rec(i + 1, { createdAt: `2026-11-0${(i % 9) + 1}T10:00:00.000Z` }));
    const b = createPaymentsBackend({ purchases, call: vi.fn() });
    const list = b.recentPurchases();
    expect(list).toHaveLength(8);
    expect(list[0]).toMatchObject({ handle: "o1", name: "Thing 9" });
    expect(list.map((p) => p.handle)).toEqual(["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8"]);
  });

  it("never shows a PayPal id or the vault to the model", () => {
    const b = createPaymentsBackend({ purchases: [rec(1)], call: vi.fn() });
    expect(JSON.stringify(b.recentPurchases())).not.toMatch(/ORDER/);
  });

  it("asks PayPal's toolkit about the order behind a handle (get_order), and returns the facts", async () => {
    const call = vi.fn(async (_m: string, args: Record<string, unknown>) => ({ ok: true, text: ORDER_TEXT(String(args.id), "3.00") }));
    const b = createPaymentsBackend({ purchases: [rec(3)], call });
    const r = await b.lookupOrder("o1");
    expect(call).toHaveBeenCalledWith("get_order", { id: "ORDER3ORDER3ORDER3" });
    expect(r).toMatchObject({ found: true, via: "get_order", order: { amountCents: 300, status: "COMPLETED", paymentStatus: "COMPLETED" } });
  });

  it("a buy that never reached PayPal has no order to look up (and PayPal is not asked)", async () => {
    const call = vi.fn();
    const b = createPaymentsBackend({ purchases: [rec(1, { paypalOrderId: undefined })], call });
    expect(await b.lookupOrder("o1")).toEqual({ found: false, reason: "no_order", via: "get_order" });
    expect(call).not.toHaveBeenCalled();
  });

  it("only handles we gave out can be looked up", async () => {
    const call = vi.fn();
    const b = createPaymentsBackend({ purchases: [rec(1)], call });
    expect(await b.lookupOrder("o9")).toMatchObject({ found: false, reason: "no_order" });
    expect(await b.lookupOrder("9XC19429B4393930R")).toMatchObject({ found: false });
    expect(call).not.toHaveBeenCalled();
  });

  it("PayPal saying no permission, not found, or down is passed on as a reason", async () => {
    const mk = (status: number) => createPaymentsBackend({ purchases: [rec(1)], call: async () => ({ ok: true, text: JSON.stringify({ ok: false, status }) }) });
    expect(await mk(404).lookupOrder("o1")).toMatchObject({ found: false, reason: "not_found" });
    expect(await mk(403).lookupOrder("o1")).toMatchObject({ found: false, reason: "no_permission" });
    expect(await mk(500).lookupOrder("o1")).toMatchObject({ found: false, reason: "unavailable" });
  });

  it("recent activity comes from the toolkit's list_transactions", async () => {
    const call = vi.fn(async () => ({ ok: true, text: JSON.stringify({ transaction_details: [{ transaction_info: { transaction_id: "T1", transaction_amount: { currency_code: "USD", value: "2.00" }, transaction_status: "S" } }] }) }));
    const r = await createPaymentsBackend({ purchases: [], call }).lookupActivity();
    expect(call).toHaveBeenCalledWith("list_transactions", {});
    expect(r).toMatchObject({ ok: true, via: "list_transactions", transactions: [{ id: "T1", amountCents: 200 }] });
  });

  it("recent activity without permission says so", async () => {
    const r = await createPaymentsBackend({ purchases: [], call: async () => ({ ok: true, text: JSON.stringify({ ok: false, status: 403 }) }) }).lookupActivity();
    expect(r).toEqual({ ok: false, reason: "no_permission", via: "list_transactions" });
  });
});
