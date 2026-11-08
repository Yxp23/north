import { authenticate } from "@/lib/auth/guard";
import { demoOnly } from "@/lib/demo/mode";
import { getLedger } from "@/lib/ledger/server";

// Demo only: wipe the purchases and go back to the starting money. The saved PayPal stays.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const off = demoOnly(auth.userId);
  if (off) return off;
  await getLedger(auth.userId).reset();
  return Response.json({ ok: true });
}
