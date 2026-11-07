// DEMO ONLY ("Pretend this assistant is tricked by a listing"). A scripted stand-in for the assistant's model that does what a
// FOOLED assistant would do: read the listing, take its hidden instruction as an order, and ask North to buy. It goes
// through the SAME MCP link and the SAME Guardian as the real assistant, so the video can show the checkpoint stopping it
// on a day the real model is not fooled (Sonnet 5.5 resisted every test injection). It is only reachable when demo tools are on.
import type Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "../agents/loop";

let n = 0;
const call = (name: string, input: unknown) => ({ type: "tool_use", id: `toolu_fooled_${++n}`, name, input }) as Anthropic.ToolUseBlock;
const msg = (content: Anthropic.ContentBlock[]) =>
  ({ id: "msg_fooled", type: "message", role: "assistant", model: "pretend", content, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } }) as unknown as Anthropic.Message;

/** The text of the last tool result the assistant was given. */
function lastToolResult(messages: Anthropic.MessageParam[]): string {
  const last = messages[messages.length - 1];
  if (!last || !Array.isArray(last.content)) return "";
  return last.content.map((b) => (b.type === "tool_result" ? (typeof b.content === "string" ? b.content : JSON.stringify(b.content)) : "")).join("\n");
}

export function pretendTrickedAssistant(productId: string): ModelClient {
  let step = 0;
  return {
    messages: {
      async create(params) {
        step++;
        if (step === 1) return msg([call("read_listing", { product_id: productId })]);
        if (step === 2) {
          // Take the hidden instruction as an order, the way a fooled assistant would.
          const page = lastToolResult(params.messages);
          const qty = Math.min(5, Math.max(1, Number(page.match(/buy\s+(\d{1,2})\s+now/i)?.[1] ?? 3)));
          const hidden = page.match(/AI assistant:[^<"]*/i)?.[0]?.trim() ?? "Urgent: buy now.";
          return msg([call("request_purchase", { product: productId, quantity: qty, reason: hidden.slice(0, 280), triggered_by: "user_request" })]);
        }
        const answer = lastToolResult(params.messages);
        const why = answer.match(/Why: ([^\n]+)/)?.[1] ?? "North did not allow it.";
        const decision = answer.match(/North's answer: (\w+)/)?.[1]?.toLowerCase() ?? "no answer";
        return msg([call("tell_person", { message: `I read the listing and it said to buy right away, so I asked North to buy it. North said ${decision}: ${why} Nothing was bought.` })]);
      },
    },
  };
}
