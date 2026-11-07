// "Ask North": the Concierge reads what the person typed or uploaded and routes it to the right helper, with the
// handoff shown in the activity panel. Routing can't move money: the router only names a destination (agents/concierge/router.ts),
// and every destination is a helper that can only read or notify. The helper receives the person's OWN words and picture.
import { runRouter, type Destination } from "../agents/concierge/router";
import type { ModelClient, StepEvent } from "../agents/loop";

export type HelperRoute = "scam_checker" | "finder" | "help_me_choose" | "payments";
export type HelperRequest = { text: string; imageBase64?: string; extra: Record<string, unknown> };
export type Delegate = (req: HelperRequest, onStep: (e: StepEvent) => void) => Promise<unknown>;
export type Delegates = Record<HelperRoute, Delegate>;

export type AskInput = {
  text?: string;
  image?: { base64: string; type: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };
  /** A follow-up (a price, a picture the person tapped) names its helper, so the router is skipped. */
  route?: Destination;
  extra?: Record<string, unknown>;
};

export type AskResult =
  | { route: HelperRoute; payload: unknown }
  | { route: "new_rule"; payload: { href: string } }
  | { route: "none"; payload: { message: string } }
  | { route: "error"; payload: { message: string } };

const HANDOFF: Record<HelperRoute | "new_rule", string> = {
  scam_checker: "Asking the Scam checker…",
  finder: "Asking the Finder…",
  help_me_choose: "Asking Help me choose…",
  payments: "Asking the Payments helper…",
  new_rule: "Opening the rule helper…",
};
const HELPERS: HelperRoute[] = ["scam_checker", "finder", "help_me_choose", "payments"];

/** Only these small things may travel with a follow-up. Everything is checked again by the helper. */
export function allowedExtra(route: string, raw: unknown): Record<string, unknown> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (route === "scam_checker") {
    const p = o.priceDollars;
    return typeof p === "number" && Number.isFinite(p) && p > 0 && p <= 100_000 ? { priceDollars: p } : {};
  }
  if (route === "help_me_choose") return typeof o.answer === "string" && o.answer.trim() ? { answer: o.answer.trim().slice(0, 60) } : {};
  return {};
}

export async function runAsk(opts: { client: ModelClient; input: AskInput; delegates: Delegates; onStep?(e: StepEvent): void }): Promise<AskResult> {
  const emit = (e: StepEvent) => opts.onStep?.(e);
  const text = (opts.input.text ?? "").trim();
  const image = opts.input.image;

  let destination: Destination | null = opts.input.route && (HELPERS as string[]).includes(opts.input.route) ? opts.input.route : null;
  if (!destination) {
    const { outcome } = await runRouter({ client: opts.client, input: { text, imageBase64: image?.base64, imageType: image?.type }, onStep: emit });
    if (outcome.kind === "error") return { route: "error", payload: { message: outcome.message } };
    destination = outcome.destination;
  }

  if (destination === "none") return { route: "none", payload: { message: "I am not sure what you need. You can ask me to find something, check a deal, set a rule, or look at your payments." } };

  if (destination === "new_rule") {
    emit({ label: HANDOFF.new_rule, state: "working" });
    emit({ label: HANDOFF.new_rule, state: "done", detail: "A rule is only saved after you read it back and say yes." });
    return { route: "new_rule", payload: { href: `/rules/new?said=${encodeURIComponent(text.slice(0, 300))}` } };
  }

  emit({ label: HANDOFF[destination], state: "working" });
  try {
    const payload = await opts.delegates[destination]({ text, imageBase64: image?.base64, extra: allowedExtra(destination, opts.input.extra) }, emit);
    emit({ label: HANDOFF[destination], state: "done" });
    return { route: destination, payload };
  } catch {
    emit({ label: HANDOFF[destination], state: "done", warn: true, detail: "That helper had a problem." });
    return { route: "error", payload: { message: "Something went wrong. Please try again." } };
  }
}
