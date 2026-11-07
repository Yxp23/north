import { describe, expect, it } from "vitest";
import { cents, parseOrder, parseTransactions } from "./parse";

// A trimmed copy of what the PayPal Agent Toolkit's get_order really returned for a sandbox buy.
const ORDER = JSON.stringify({
  id: "9XC19429B4393930R", intent: "CAPTURE", status: "COMPLETED",
  payment_source: { paypal: { email_address: "sb-x@personal.example.com", account_id: "LEUUHZNP39MXG" } },
  purchase_units: [{
    amount: { currency_code: "USD", value: "1.93" }, custom_id: "pur_c065d561",
    payments: { captures: [{ id: "69W28652SX784200J", status: "REFUNDED", amount: { currency_code: "USD", value: "1.93" }, create_time: "2026-11-07T02:02:35Z" }], refunds: [{ id: "R1", status: "COMPLETED", amount: { currency_code: "USD", value: "1.93" } }] },
  }],
});

describe("money from PayPal text", () => {
  it.each([["1.93", 193], ["349.00", 34900], ["349", 34900], ["0.5", 50], ["1,234.50", 123450], ["72.54", 7254]])("%s is %d cents", (v, c) => expect(cents(v)).toBe(c));
  it.each([["abc"], [""], [undefined], [null], ["-3.00"], ["1.234"], [5]])("%j is not money", (v) => expect(cents(v)).toBeNull());
});

describe("an order from the PayPal Agent Toolkit", () => {
  it("gives the facts: id, status, amount, and what happened to the payment", () => {
    expect(parseOrder(ORDER)).toEqual({
      ok: true,
      order: { orderId: "9XC19429B4393930R", status: "COMPLETED", amountCents: 193, currency: "USD", customId: "pur_c065d561", paymentStatus: "REFUNDED", paidAt: "2026-11-07T02:02:35Z" },
    });
  });
  it("a payment that is still just completed", () => {
    const o = JSON.parse(ORDER);
    o.purchase_units[0].payments.captures[0].status = "COMPLETED";
    expect(parseOrder(JSON.stringify(o))).toMatchObject({ ok: true, order: { paymentStatus: "COMPLETED" } });
  });
  it("an order with no payment yet has no payment status", () => {
    const o = JSON.parse(ORDER);
    delete o.purchase_units[0].payments;
    o.status = "CREATED";
    expect(parseOrder(JSON.stringify(o))).toMatchObject({ ok: true, order: { status: "CREATED", paymentStatus: undefined } });
  });
  it("an error from PayPal is not an order", () => {
    expect(parseOrder(JSON.stringify({ ok: false, status: 404, code: "PAYPAL_API_HTTP_ERROR", message: "The requested resource ID was not found" }))).toEqual({ ok: false, reason: "not_found" });
    expect(parseOrder(JSON.stringify({ ok: false, status: 403, message: "x" }))).toEqual({ ok: false, reason: "no_permission" });
    expect(parseOrder(JSON.stringify({ ok: false, status: 500, message: "x" }))).toEqual({ ok: false, reason: "unavailable" });
  });
  it("junk is not an order", () => {
    expect(parseOrder("not json")).toEqual({ ok: false, reason: "unavailable" });
    expect(parseOrder("{}")).toEqual({ ok: false, reason: "unavailable" });
    expect(parseOrder(JSON.stringify({ id: "X", status: "COMPLETED", purchase_units: [] }))).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("a transaction list from the PayPal Agent Toolkit", () => {
  const TX = JSON.stringify({
    transaction_details: [
      { transaction_info: { transaction_id: "T1", transaction_amount: { currency_code: "USD", value: "-1.93" }, transaction_status: "S", transaction_initiation_date: "2026-11-07T02:02:35+0000", transaction_subject: "North purchase" } },
      { transaction_info: { transaction_id: "T2", transaction_amount: { currency_code: "USD", value: "72.54" }, transaction_status: "S", transaction_initiation_date: "2026-11-06T02:02:35+0000" } },
      { transaction_info: { transaction_id: "BAD", transaction_amount: { currency_code: "USD", value: "oops" } } },
    ],
  });
  it("gives the transactions with their amounts in cents, newest first, and skips broken ones", () => {
    const r = parseTransactions(TX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transactions.map((t) => [t.id, t.amountCents, t.status])).toEqual([["T1", 193, "S"], ["T2", 7254, "S"]]);
  });
  it("money going out is shown as a positive amount spent", () => {
    const r = parseTransactions(TX);
    if (r.ok) expect(r.transactions[0]).toMatchObject({ amountCents: 193, direction: "out" });
  });
  it("no permission is said plainly", () => {
    expect(parseTransactions(JSON.stringify({ ok: false, status: 403, message: "Authorization failed due to insufficient permissions." }))).toEqual({ ok: false, reason: "no_permission" });
  });
  it("an empty list is an empty list", () => {
    expect(parseTransactions(JSON.stringify({ transaction_details: [] }))).toEqual({ ok: true, transactions: [] });
  });
});
