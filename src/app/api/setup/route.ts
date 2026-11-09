import { authenticate } from "@/lib/auth/guard";
import { readJson } from "@/lib/http/body";
import { getLedger } from "@/lib/ledger/server";
import { limited } from "@/lib/ratelimit/route";
import { applySetup, type SetupResult } from "@/lib/setup/setup";

// First-run setup: the weekly money and the rent-and-bills money. Only for an account with no buys yet (checked inside), and only the
// person's own logged-in tap can reach it. No assistant has a way here.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "setup", 30, 3600);
  if (tooMany) return tooMany;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const now = new Date();
  const result = await getLedger(auth.userId).update<SetupResult>((d) => applySetup(d, { weeklyDollars: body?.weeklyDollars, protectedDollars: body?.protectedDollars }, now));
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
