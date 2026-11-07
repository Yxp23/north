import { describe, expect, it } from "vitest";
import { compareRecords, oursInWords, paypalInWords } from "./words";
import type { OrderFacts } from "../paypal-toolkit/parse";

const order = (over: Partial<OrderFacts> = {}): OrderFacts => ({ orderId: "X", status: "COMPLETED", amountCents: 193, currency: "USD", paymentStatus: "COMPLETED", ...over });

describe("plain words for a payment", () => {
  it.each([["paid", "Paid"], ["refunded", "Refunded"], ["pending", "Waiting"], ["failed", "Did not go through"]] as const)("North's record %s is '%s'", (s, w) => expect(oursInWords(s)).toBe(w));

  it.each([
    [{ paymentStatus: "COMPLETED" }, "Paid"],
    [{ paymentStatus: "REFUNDED" }, "Refunded"],
    [{ paymentStatus: "PARTIALLY_REFUNDED" }, "Partly refunded"],
    [{ paymentStatus: "PENDING" }, "Waiting"],
    [{ paymentStatus: "DECLINED" }, "Did not go through"],
    [{ paymentStatus: undefined, status: "COMPLETED" }, "Paid"],
    [{ paymentStatus: undefined, status: "CREATED" }, "Not paid yet"],
    [{ paymentStatus: undefined, status: "APPROVED" }, "Not paid yet"],
    [{ paymentStatus: undefined, status: "VOIDED" }, "Did not go through"],
    [{ paymentStatus: "SOMETHING_NEW" }, "Not sure"],
  ])("PayPal %j is '%s'", (over, w) => expect(paypalInWords(order(over as Partial<OrderFacts>))).toBe(w));
});

describe("do North and PayPal agree?", () => {
  it("yes when the words and the amount match", () => {
    expect(compareRecords({ status: "paid", amountCents: 193 }, order())).toEqual({ agrees: true, note: "PayPal and North agree." });
  });
  it("no when PayPal says refunded and North says paid", () => {
    const r = compareRecords({ status: "paid", amountCents: 193 }, order({ paymentStatus: "REFUNDED" }));
    expect(r.agrees).toBe(false);
    expect(r.note).toMatch(/PayPal says Refunded/);
  });
  it("no when the amounts differ", () => {
    const r = compareRecords({ status: "paid", amountCents: 193 }, order({ amountCents: 250 }));
    expect(r.agrees).toBe(false);
    expect(r.note).toMatch(/amount/i);
  });
  it("a buy North still marks waiting, that PayPal shows as paid, is a difference to tell the user about", () => {
    expect(compareRecords({ status: "pending", amountCents: 193 }, order()).agrees).toBe(false);
  });
  it("a refund that North recorded and PayPal shows refunded agree", () => {
    expect(compareRecords({ status: "refunded", amountCents: 193 }, order({ paymentStatus: "REFUNDED" })).agrees).toBe(true);
  });
});
