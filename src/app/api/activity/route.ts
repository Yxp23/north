import { connection } from "next/server";
import { authenticate } from "@/lib/auth/guard";
import { weekActivity } from "@/lib/ledger/activity";
import { getLedger } from "@/lib/ledger/server";

// "What North did this week", in plain words, for the person's own account only.
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  await connection();
  const data = await getLedger(auth.userId).read();
  return Response.json({ lines: weekActivity(data, new Date()) });
}
