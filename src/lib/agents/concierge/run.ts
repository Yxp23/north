// Server wiring for the Concierge. It READS the ledger (to know the user's rules and money) and nothing else:
// agent code never writes to the ledger, never saves a rule, and never touches checkout. A test enforces that.
import "server-only";
import { getAnthropic, NOT_SET_UP } from "../client";
import { getLedger } from "../../ledger/server";
import { toRules } from "../../ledger/logic";
import type { StepEvent } from "../loop";
import { runConcierge, type ConciergePayload } from "./concierge";

export async function runConciergeForUser(opts: {
  text: string;
  followUp?: { missing: "amount" | "hour"; answer: string };
  onStep?(event: StepEvent): void;
}): Promise<{ payload: ConciergePayload; steps: StepEvent[] }> {
  let model;
  try {
    model = getAnthropic();
  } catch {
    return { payload: { kind: "error", message: NOT_SET_UP }, steps: [] };
  }
  const data = await getLedger().read();
  const out = await runConcierge({
    client: model,
    text: opts.text,
    followUp: opts.followUp,
    onStep: opts.onStep,
    context: { rules: toRules(data.rules), weeklyBudgetCents: data.weeklyBudgetCents, protectedCents: data.protectedCents, now: new Date() },
  });
  return { payload: out.payload, steps: out.steps };
}
