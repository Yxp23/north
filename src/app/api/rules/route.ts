import { connection } from "next/server";
import { authenticate } from "@/lib/auth/guard";
import { effective } from "@/lib/guardian";
import { readJson } from "@/lib/http/body";
import { getLedger } from "@/lib/ledger/server";
import { toRules } from "@/lib/ledger/logic";
import { limited } from "@/lib/ratelimit/route";
import { dollarsLabel } from "@/lib/rules/describe";
import { saveRules } from "@/lib/rules/save";
import { summarizeRules } from "@/lib/rules/summary";

// GET: my rules in plain words. POST: save rules the user confirmed (checked again, tighten-only, one-day delay).
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  await connection();
  const now = new Date();
  const data = await getLedger(auth.userId).read();
  const rules = toRules(data.rules);
  const essentials = effective(rules.essentials, now) ?? [];
  return Response.json({
    rules: summarizeRules(rules, now),
    always: [
      `Your rent and bills money (${dollarsLabel(data.protectedCents)}) is protected. I never spend it.`,
      `I never go over your plan for the week (${dollarsLabel(data.weeklyBudgetCents)}).`,
      essentials.length ? `These never have to wait: ${essentials.join(", ")}.` : "Nothing is on your must-have list.",
    ],
  });
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "rules-save", 60, 3600);
  if (tooMany) return tooMany;
  const body = await readJson(req);
  const result = await saveRules(body, { ledger: getLedger(auth.userId), now: () => new Date() });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
