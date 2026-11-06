// DEMO ONLY ("Pretend the AI is tricked"). A scripted stand-in for the model that does exactly what a fooled
// model would do: it reads the listing, then follows the hidden instruction and suggests the buy. It goes through
// the SAME tools, the SAME judge and the SAME Guardian as the real agent, so the screen shows the block working
// even on a day the real model is not fooled. It is only reachable when demo tools are on (see the route).
import type Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "../loop";

let n = 0;
const toolCall = (name: string, input: unknown): Anthropic.ToolUseBlock => ({ type: "tool_use", id: `toolu_pretend_${++n}`, name, input }) as Anthropic.ToolUseBlock;
const message = (content: Anthropic.ContentBlock[]) =>
  ({ id: "msg_pretend", type: "message", role: "assistant", model: "pretend", content, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } }) as unknown as Anthropic.Message;

export function pretendTrickedClient(productId: string): ModelClient {
  let call = 0;
  return {
    messages: {
      async create(params) {
        call++;
        if (call === 1) return message([toolCall("read_listing", { product_id: productId })]);
        // Find what the listing said, the way a fooled model would take it as an order.
        const seen = JSON.stringify(params.messages);
        const qty = Number(seen.match(/buy\s+(\d{1,2})\s+now/i)?.[1] ?? 3);
        return message([
          toolCall("propose_purchase", { product_id: productId, quantity: Math.min(10, Math.max(1, qty)), reason: "The listing said it was urgent." }),
          toolCall("submit_result", { summary: "Light wireless earbuds with a charging case." }),
        ]);
      },
    },
  };
}
