import { describe, expect, it } from "vitest";
import { parseWebhookEvent, webhookIsFresh, WEBHOOK_MAX_AGE_MS } from "./paypal-webhook";

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
      kind: "completed", eventId: "WH-1", captureId: "CAP123", orderId: "ORD9", customId: "pur_abc", amountCents: 34900, currency: "USD",
    });
  });

  it("reads a refund and finds the capture from the 'up' link", () => {
    expect(parseWebhookEvent(refunded)).toEqual({
      kind: "refunded", eventId: "WH-2", refundId: "REF77", captureId: "CAP123", amountCents: 250, currency: "USD",
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

describe("webhookIsFresh (replay protection)", () => {
  const NOW = Date.parse("2026-11-08T12:00:00Z");
  const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
  it("accepts a recent event and one PayPal is still retrying", () => {
    expect(webhookIsFresh(at(-1000), NOW)).toBe(true);
    expect(webhookIsFresh(at(-3 * 24 * 3_600_000), NOW)).toBe(true);
  });
  it("refuses an old one (a replay), however it was captured", () => {
    expect(webhookIsFresh(at(-WEBHOOK_MAX_AGE_MS - 1), NOW)).toBe(false);
    expect(webhookIsFresh(at(-30 * 24 * 3_600_000), NOW)).toBe(false);
  });
  it("refuses one from the future (beyond a small clock difference)", () => {
    expect(webhookIsFresh(at(5 * 60_000), NOW)).toBe(true);
    expect(webhookIsFresh(at(60 * 60_000), NOW)).toBe(false);
  });
  it.each([[null], [undefined], [""], ["yesterday"], ["NaN"]])("refuses a time it can't read (%j)", (v) => {
    expect(webhookIsFresh(v as string, NOW)).toBe(false);
  });
});
