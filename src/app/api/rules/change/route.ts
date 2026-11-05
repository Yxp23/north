import { getLedger } from "@/lib/ledger/server";
import { changeRule } from "@/lib/rules/change";

// POST: the user changes or removes a rule by hand (My rules screen). Checked again here: stricter starts
// now, weaker or off waits one day. No AI is involved, and no agent can reach this route's code.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await changeRule(body, { ledger: getLedger(), now: () => new Date() });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
