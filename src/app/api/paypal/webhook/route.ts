import { parseWebhookEvent, webhookIsFresh } from "@/lib/paypal-webhook";
import { verifyWebhookSignature } from "@/lib/paypal";
import { applyWebhook } from "@/lib/ledger/logic";
import { findPurchaseOwner, getLedger } from "@/lib/ledger/server";

// PayPal calls this when a payment completes or is refunded. It is on the public list (lib/auth/public-paths.ts) because it
// is protected by PayPal's SIGNATURE instead of a login: we trust nothing until PayPal confirms it.
// Also: an event older than a few days is a replay and is refused; an event id handled once is never handled again (the
// database remembers every id); and a payment is only believed if its amount and currency match what we asked for.
// Without PAYPAL_WEBHOOK_ID we refuse everything. The person it belongs to comes from OUR records of the payment.
const MAX_BODY = 200_000;

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Too big" }, { status: 413 });
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (!process.env.PAYPAL_WEBHOOK_ID) {
    console.error("[webhook] PAYPAL_WEBHOOK_ID is not set, so events are rejected");
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  let verified = false;
  try {
    verified = await verifyWebhookSignature(req.headers, raw);
  } catch (e) {
    console.error("[webhook] could not verify", e);
    return Response.json({ error: "Could not verify" }, { status: 502 }); // PayPal will retry
  }
  if (!verified) {
    console.warn("[webhook] signature check FAILED, event ignored");
    return Response.json({ error: "Bad signature" }, { status: 401 });
  }
  // The signature covers the transmission time, so this time can be trusted. An old one is a replay.
  if (!webhookIsFresh(req.headers.get("paypal-transmission-time"), Date.now())) {
    console.warn("[webhook] event is too old (or its time is unreadable): refused as a replay");
    return Response.json({ error: "Stale event" }, { status: 400 });
  }

  const parsed = parseWebhookEvent(event);
  if (parsed.kind === "ignored") return Response.json({ ok: true, note: `ignored ${parsed.eventType}` });

  try {
    const owner = await findPurchaseOwner(
      parsed.kind === "completed" ? { purchaseId: parsed.customId, captureId: parsed.captureId, orderId: parsed.orderId } : { captureId: parsed.captureId },
    );
    if (!owner) {
      console.warn(`[webhook] ${parsed.kind} ${parsed.eventId}: not a payment we made`);
      return Response.json({ ok: true, note: "unknown payment" });
    }
    const result = await getLedger(owner).update((data) => applyWebhook(data, parsed, new Date()));
    console.log(`[webhook] ${parsed.kind} ${parsed.eventId}: ${result.note}`);
    return Response.json({ ok: true, note: result.note });
  } catch (e) {
    // The database refuses an event id it has seen before (and saves nothing else from that call). That is not an error.
    if (e instanceof Error && /duplicate webhook event/.test(e.message)) return Response.json({ ok: true, note: "duplicate event" });
    console.error("[webhook] could not apply", e instanceof Error ? e.message : e);
    return Response.json({ error: "Could not apply" }, { status: 500 }); // PayPal will retry
  }
}
