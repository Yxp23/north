import { parseWebhookEvent } from "@/lib/paypal-webhook";
import { verifyWebhookSignature } from "@/lib/paypal";
import { applyWebhook } from "@/lib/ledger/logic";
import { getLedger } from "@/lib/ledger/server";

// PayPal calls this when a payment completes or is refunded.
// We trust nothing until PayPal confirms the signature. Without PAYPAL_WEBHOOK_ID we refuse everything.
export async function POST(req: Request) {
  const raw = await req.text();
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

  const parsed = parseWebhookEvent(event);
  const result = await getLedger().update((data) => applyWebhook(data, parsed, new Date()));
  console.log(`[webhook] ${parsed.kind} ${parsed.eventId}: ${result.note}`);
  return Response.json({ ok: true, note: result.note });
}
