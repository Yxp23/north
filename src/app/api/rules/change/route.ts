import { authenticate } from "@/lib/auth/guard";
import { readJson } from "@/lib/http/body";
import { getLedger } from "@/lib/ledger/server";
import { limited } from "@/lib/ratelimit/route";
import { changeRule } from "@/lib/rules/change";

// POST: the user changes or removes a rule by hand (My rules screen). Checked again here: stricter starts
// now, weaker or off waits one day. No AI is involved, and no agent can reach this route's code.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "rules-change", 60, 3600);
  if (tooMany) return tooMany;
  const body = await readJson(req);
  const result = await changeRule(body, { ledger: getLedger(auth.userId), now: () => new Date() });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
