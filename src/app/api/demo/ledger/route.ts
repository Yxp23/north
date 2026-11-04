import { connection } from "next/server";
import { getLedger, isDemoMode } from "@/lib/ledger/server";

// Demo only: lets the end-to-end script look at purchases and the audit log.
// Never includes the saved PayPal token.
export async function GET() {
  await connection(); // always fresh, never prerendered at build time
  if (!isDemoMode()) return Response.json({ error: "Not available" }, { status: 404 });
  const { paypalVault, ...rest } = await getLedger().read();
  return Response.json({ ...rest, paypalConnected: Boolean(paypalVault) });
}
