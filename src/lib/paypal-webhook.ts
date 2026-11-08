// Turns a PayPal webhook event into the few facts we care about. Pure: no network, no database.
// Signature checking happens before this, in the webhook route (see verifyWebhookSignature).

export type ParsedWebhook =
  | { kind: "completed"; eventId: string; captureId: string; orderId?: string; customId?: string; amountCents?: number; currency?: string }
  | { kind: "refunded"; eventId: string; refundId: string; captureId?: string; amountCents?: number; currency?: string }
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
      currency: str(r.amount?.currency_code),
    };
  }

  if (eventType === "PAYMENT.CAPTURE.REFUNDED" && str(r?.id)) {
    // The refund points back at its capture with a link like .../v2/payments/captures/{id}.
    const up = Array.isArray(r.links) ? r.links.find((l: any) => l?.rel === "up") : undefined;
    const captureId = str(up?.href)?.split("/").filter(Boolean).pop();
    return { kind: "refunded", eventId, refundId: r.id, captureId, amountCents: toCents(r.amount?.value), currency: str(r.amount?.currency_code) };
  }

  return { kind: "ignored", eventId, eventType };
}

/**
 * Replay protection, part 1: how old a webhook may be. PayPal retries a failed delivery for about three days, so anything much
 * older than that is a replay (or a clock that is wrong). A time we can't read is refused too. (Part 2 is the database: an
 * event id that was handled once is never handled again.)
 */
export const WEBHOOK_MAX_AGE_MS = 4 * 24 * 3_600_000;
export const WEBHOOK_MAX_FUTURE_MS = 10 * 60_000;

export function webhookIsFresh(transmissionTime: string | null | undefined, nowMs: number): boolean {
  const t = transmissionTime ? Date.parse(transmissionTime) : Number.NaN;
  if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return false;
  return nowMs - t <= WEBHOOK_MAX_AGE_MS && t - nowMs <= WEBHOOK_MAX_FUTURE_MS;
}
