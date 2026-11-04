import { captureOrder, createOrderWithVault, extractCaptureId, SPIKE_AMOUNT } from "@/lib/paypal";
import { readVault } from "@/lib/spike-store";

// Charge the saved PayPal account with no popup.
// This path is NOT confirmed in PayPal's docs, so every raw response is returned and logged.
export async function POST() {
  const saved = await readVault();
  if (!saved) return Response.json({ error: "No saved PayPal yet. Do the first purchase." }, { status: 409 });

  const created = await createOrderWithVault(saved.vaultId, SPIKE_AMOUNT);
  if (!created.ok) {
    return Response.json(
      { error: "create order with saved account failed", fallback: "one-tap approval per purchase", raw: { created: created.body } },
      { status: 502 },
    );
  }

  const status: string = created.body.status;
  let captureId = extractCaptureId(created.body);
  let captured: unknown = undefined;

  // It may already be COMPLETED. If APPROVED or CREATED, capture it ourselves.
  if (status === "APPROVED" || status === "CREATED") {
    const cap = await captureOrder(created.body.id);
    captured = cap.body;
    if (!cap.ok) {
      return Response.json({ error: "capture failed", status, raw: { created: created.body, captured } }, { status: 502 });
    }
    captureId = extractCaptureId(cap.body);
  } else if (status !== "COMPLETED") {
    // e.g. PAYER_ACTION_REQUIRED: the saved account needs the customer, so the popup flow is the fallback.
    return Response.json(
      { error: `unexpected order status ${status}`, fallback: "one-tap approval per purchase", raw: { created: created.body } },
      { status: 409 },
    );
  }

  return Response.json({ firstStatus: status, captureId, raw: { created: created.body, captured } });
}
