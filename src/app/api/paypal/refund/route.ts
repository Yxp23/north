import { refundCapture } from "@/lib/paypal";

export async function POST(req: Request) {
  const { captureId } = await req.json();
  if (typeof captureId !== "string") return Response.json({ error: "captureId required" }, { status: 400 });
  const r = await refundCapture(captureId);
  if (!r.ok) return Response.json({ error: "refund failed", raw: r.body }, { status: 502 });
  return Response.json({ refundStatus: r.body.status, raw: r.body });
}
