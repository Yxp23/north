import { connection } from "next/server";
import { authenticate } from "@/lib/auth/guard";
import { demoAllowed, isDemoDeployment } from "@/lib/demo/mode";
import { simulatedPayments } from "@/lib/checkout/mode";
import { getLedger } from "@/lib/ledger/server";
import { summarize } from "@/lib/ledger/logic";
import { storeIsLive } from "@/lib/store";

// Everything the home screen shows. The screen asks again every few seconds, so a
// payment or refund that arrives by webhook shows up on its own.
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  await connection(); // per-request data: never prerendered at build time
  const data = await getLedger(auth.userId).read();
  return Response.json({
    ...summarize(data, new Date()),
    paypalSaved: Boolean(data.paypalVault) || simulatedPayments(),
    demoMode: demoAllowed(auth.userId),
    demoDeployment: isDemoDeployment(),
    storeLive: storeIsLive(),
  });
}
