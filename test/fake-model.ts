// A scripted stand-in for the Claude API, so agent tests run offline and are exact.
import type Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "../src/lib/agents/loop";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "thinking"; thinking: string; signature: string };

export const text = (t: string): Block => ({ type: "text", text: t });
let n = 0;
export const toolUse = (name: string, input: unknown = {}): Block => ({ type: "tool_use", id: `toolu_${++n}`, name, input });

export function reply(content: Block[], stop_reason: "tool_use" | "end_turn" | "refusal" = "tool_use"): Anthropic.Message {
  return { id: "msg_fake", type: "message", role: "assistant", model: "fake", content, stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;
}

/** Answers each call with the next scripted reply (or the result of a function). Records every request. */
export function scripted(replies: (Anthropic.Message | Error | ((req: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message))[]) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  const client: ModelClient = {
    messages: {
      async create(params) {
        requests.push(JSON.parse(JSON.stringify(params))); // the loop edits its messages array, so keep a copy
        const next = replies[Math.min(i++, replies.length - 1)];
        if (next instanceof Error) throw next;
        return typeof next === "function" ? next(params) : next;
      },
    },
  };
  return { client, requests, calls: () => i };
}
