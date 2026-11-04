import { describe, expect, it } from "vitest";
import { parseWebhookEvent } from "./paypal-webhook";

const completed = {
  id: "WH-1",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: "CAP123",
    custom_id: "pur_abc",
    amount: { currency_code: "USD", value: "349.00" },
    supplementary_data: { related_ids: { order_id: "ORD9" } },
  },
};
const refunded = {
  id: "WH-2",
  event_type: "PAYMENT.CAPTURE.REFUNDED",
  resource: {
    id: "REF77",
    amount: { currency_code: "USD", value: "2.50" },
    links: [
      { rel: "self", href: "https://api.sandbox.paypal.com/v2/payments/refunds/REF77" },
      { rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/CAP123" },
    ],
  },
};

describe("parseWebhookEvent", () => {
  it("reads a completed capture", () => {
    expect(parseWebhookEvent(completed)).toEqual({
      kind: "completed", eventId: "WH-1", captureId: "CAP123", orderId: "ORD9", customId: "pur_abc", amountCents: 34900,
    });
  });

  it("reads a refund and finds the capture from the 'up' link", () => {
    expect(parseWebhookEvent(refunded)).toEqual({
      kind: "refunded", eventId: "WH-2", refundId: "REF77", captureId: "CAP123", amountCents: 250,
    });
  });

  it("rounds money without float mistakes", () => {
    const e = { ...completed, resource: { ...completed.resource, amount: { value: "19.99" } } };
    expect(parseWebhookEvent(e)).toMatchObject({ amountCents: 1999 });
  });

  it("ignores other event types", () => {
    expect(parseWebhookEvent({ id: "WH-3", event_type: "CUSTOMER.DISPUTE.CREATED", resource: {} })).toEqual({
      kind: "ignored", eventId: "WH-3", eventType: "CUSTOMER.DISPUTE.CREATED",
    });
  });

  it("ignores junk instead of throwing", () => {
    expect(parseWebhookEvent(null).kind).toBe("ignored");
    expect(parseWebhookEvent("hello").kind).toBe("ignored");
    expect(parseWebhookEvent({ id: "x", event_type: "PAYMENT.CAPTURE.COMPLETED" }).kind).toBe("ignored");
  });
});
