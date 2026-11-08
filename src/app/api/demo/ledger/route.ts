import { connection } from "next/server";
import { authenticate } from "@/lib/auth/guard";
import { demoOnly } from "@/lib/demo/mode";
import { getLedger } from "@/lib/ledger/server";

// Demo only: lets the end-to-end script look at purchases and the audit log.
// Never includes the saved PayPal token, and never includes any assistant's key (not even its hash).
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const off = demoOnly(auth.userId);
  if (off) return off;
  await connection(); // always fresh, never prerendered at build time
  const { paypalVault, agentCheckpoint, ...rest } = await getLedger(auth.userId).read();
  return Response.json({
    ...rest,
    paypalConnected: Boolean(paypalVault),
    agentCheckpoint: { ...agentCheckpoint, agents: agentCheckpoint.agents.map((a) => ({ id: a.id, name: a.name, createdAt: a.createdAt, scopes: a.scopes, revokedAt: a.revokedAt, lastUsedAt: a.lastUsedAt })) },
  });
}
