// Browser side of buying: one tap on Buy, with the steps streamed back for the activity panel.
import type { StepEvent } from "@/lib/agents/loop";
import type { CheckoutOutcome } from "@/lib/checkout/checkout";
import { readNdjson } from "@/lib/ndjson-client";

/** One per tap. It is also PayPal's request id, so a retry can't charge twice. */
export const newAttemptId = () => `a-${crypto.randomUUID()}`;

export const toStep = (line: { [k: string]: unknown }): StepEvent => ({
  label: String(line.label),
  state: line.state as StepEvent["state"],
  detail: line.detail as string | undefined,
  warn: line.warn as boolean | undefined,
});

/** Buys one product. `seenCents` is the price on screen: if the live price is different, nothing is charged. */
export async function streamCheckout(
  opts: { productId: string; seenCents: number; overrideWait: boolean; pretendHour?: number; /** The size picked, for a product that has sizes. */ size?: string },
  onSteps: (events: StepEvent[]) => void,
): Promise<{ outcome: CheckoutOutcome; events: StepEvent[] }> {
  const events: StepEvent[] = [];
  const res = await fetch("/api/checkout?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: opts.productId, attemptId: newAttemptId(), overrideWait: opts.overrideWait, seenCents: opts.seenCents, pretendHour: opts.pretendHour, size: opts.size }),
  });
  if (!res.ok) throw new Error(String(res.status));
  let outcome: CheckoutOutcome | null = null;
  await readNdjson(res, (line) => {
    if (line.type === "step") {
      events.push(toStep(line));
      onSteps([...events]);
    } else if (line.type === "result") outcome = line.outcome as CheckoutOutcome;
  });
  if (!outcome) throw new Error("no result");
  return { outcome, events };
}
