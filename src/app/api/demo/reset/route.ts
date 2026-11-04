import { getLedger, isDemoMode } from "@/lib/ledger/server";

// Demo only: wipe the purchases and go back to the starting money. The saved PayPal stays.
export async function POST() {
  if (!isDemoMode()) return Response.json({ error: "Not available" }, { status: 404 });
  await getLedger().reset();
  return Response.json({ ok: true });
}
