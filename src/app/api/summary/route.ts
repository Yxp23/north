import { getLedger, isDemoMode } from "@/lib/ledger/server";
import { summarize } from "@/lib/ledger/logic";

// Everything the home screen shows. The screen asks again every few seconds, so a
// payment or refund that arrives by webhook shows up on its own.
export async function GET() {
  const data = await getLedger().read();
  return Response.json({
    ...summarize(data, new Date()),
    paypalSaved: Boolean(data.paypalVault),
    demoMode: isDemoMode(),
  });
}
