// Turns a PayPal webhook event into the few facts we care about. Pure: no network, no database.
// Signature checking happens before this, in the webhook route (see verifyWebhookSignature).

export type ParsedWebhook =
  | { kind: "completed"; eventId: string; captureId: string; orderId?: string; customId?: string; amountCents?: number }
  | { kind: "refunded"; eventId: string; refundId: string; captureId?: string; amountCents?: number }
  | { kind: "ignored"; eventId: string; eventType: string };

/* eslint-disable @typescript-eslint/no-explicit-any -- the event is untrusted JSON, read defensively */
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// "19.99" -> 1999. Rounds so floating point can't leave us a cent off.
function toCents(v: unknown): number | undefined {
  const n = Number(str(v));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function parseWebhookEvent(event: any): ParsedWebhook {
  const eventId = str(event?.id) ?? "unknown";
  const eventType = str(event?.event_type) ?? "unknown";
  const r = event?.resource;

  if (eventType === "PAYMENT.CAPTURE.COMPLETED" && str(r?.id)) {
    return {
      kind: "completed",
      eventId,
      captureId: r.id,
      orderId: str(r.supplementary_data?.related_ids?.order_id),
      customId: str(r.custom_id),
      amountCents: toCents(r.amount?.value),
    };
  }

  if (eventType === "PAYMENT.CAPTURE.REFUNDED" && str(r?.id)) {
    // The refund points back at its capture with a link like .../v2/payments/captures/{id}.
    const up = Array.isArray(r.links) ? r.links.find((l: any) => l?.rel === "up") : undefined;
    const captureId = str(up?.href)?.split("/").filter(Boolean).pop();
    return { kind: "refunded", eventId, refundId: r.id, captureId, amountCents: toCents(r.amount?.value) };
  }

  return { kind: "ignored", eventId, eventType };
}
