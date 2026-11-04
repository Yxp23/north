import { captureOrder, extractCaptureId, extractVault, getOrder } from "@/lib/paypal";
import { writeVault } from "@/lib/spike-store";

export async function POST(req: Request) {
  const { orderId } = await req.json();
  if (typeof orderId !== "string") return Response.json({ error: "orderId required" }, { status: 400 });

  const cap = await captureOrder(orderId);
  if (!cap.ok) return Response.json({ error: "capture failed", raw: cap.body }, { status: 502 });

  let vault = extractVault(cap.body);
  let orderRaw: unknown = undefined;
  // Docs say to read the order if the capture response has no token.
  if (!vault.vaultId) {
    const o = await getOrder(orderId);
    orderRaw = o.body;
    vault = extractVault(o.body);
  }
  if (vault.vaultId) await writeVault({ vaultId: vault.vaultId, customerId: vault.customerId });

  return Response.json({
    captureId: extractCaptureId(cap.body),
    saved: Boolean(vault.vaultId),
    vaultStatus: vault.status ?? null,
    raw: { capture: cap.body, order: orderRaw },
  });
}
