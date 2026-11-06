// A small, careful agent loop on the Claude API with tool use. Used by every North agent.
//
// What it guarantees (see loop.test.ts):
//  - at most `maxSteps` model calls (about 6), so it can never run away;
//  - the only tools are the ones the caller gives it. Anything else the model asks for does nothing;
//  - every step is reported in plain words that WE wrote (never the model's own text);
//  - the model's whole reply is echoed back unchanged (the API needs that for tool use);
//  - API problems become a plain message, never a raw error (which could hold a key fragment).
// The loop has no way to reach money: it only calls the tools it was handed.
import Anthropic from "@anthropic-ai/sdk";

/** The one part of the SDK we use. A fake can stand in for it in tests. */
export type ModelClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

/**
 * One line for the activity panel. `label` is plain words that WE wrote (never the model's text).
 * `detail` is the tool call and what it gave back, for the "Show details" toggle. `warn` marks a caution.
 */
export type StepEvent = { label: string; state: "working" | "done"; detail?: string; warn?: boolean };

export type ToolOutcome<T> = {
  /** What the model reads back. */
  content: string;
  isError?: boolean;
  /** Set by the final tool: the loop ends with this as its result. */
  final?: T;
  /** Plain-word cautions (written by us) that become their own steps, like "Found hidden instructions". */
  notes?: string[];
};

export type ToolDef<T> = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  /** Plain words for the activity panel, written by us. */
  label: string;
  run(input: unknown): ToolOutcome<T> | Promise<ToolOutcome<T>>;
};

export type AgentRun<T> = {
  end: "done" | "max_steps" | "no_answer" | "refused" | "error";
  result?: T;
  steps: StepEvent[];
  modelCalls: number;
  /** Plain words for the user when something went wrong. */
  message?: string;
};

export type RunAgentOptions<T> = {
  client: ModelClient;
  model: string;
  system: string;
  /** The first message: words, or words and a picture. */
  user: string | Anthropic.ContentBlockParam[];
  tools: ToolDef<T>[];
  /** The tool that ends the run. Defaults to the last tool. */
  finalTool?: string;
  maxSteps?: number;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  /** The first line in the activity panel. */
  startLabel: string;
  onStep?(event: StepEvent): void;
};

export const MAX_STEPS = 6;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
/** The tool call and its answer, short. Only our own tool names, the model's tool input, and our tool's output. */
const detailOf = (name: string, input: unknown, content: string, isError?: boolean) =>
  clip(`${name}(${clip(JSON.stringify(input ?? {}) ?? "{}", 200)}) → ${isError ? "(did not work) " : ""}${content}`, 600);

function plainError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "I'm busy right now. Please try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "The AI helper is not set up yet. Please tell the person who set up North.";
  if (err instanceof Anthropic.APIConnectionError) return "I couldn't reach the AI helper. Please try again.";
  return "Something went wrong with the AI helper. Please try again.";
}

export async function runAgent<T>(opts: RunAgentOptions<T>): Promise<AgentRun<T>> {
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const steps: StepEvent[] = [];
  const emit = (event: StepEvent) => {
    steps.push(event);
    opts.onStep?.(event);
  };
  const finish = (end: AgentRun<T>["end"], extra: Partial<AgentRun<T>> = {}): AgentRun<T> => {
    emit({ label: end === "done" ? "Done." : "Stopped.", state: "done" });
    return { end, steps, modelCalls, ...extra };
  };

  const finalTool = opts.finalTool ?? opts.tools[opts.tools.length - 1].name;
  const toolDefs: Anthropic.Tool[] = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
  let modelCalls = 0;
  let nudged = false;

  emit({ label: opts.startLabel, state: "working" });

  while (modelCalls < maxSteps) {
    let response: Anthropic.Message;
    try {
      modelCalls++;
      response = await opts.client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 4000,
        system: opts.system,
        tools: toolDefs,
        messages,
        output_config: { effort: opts.effort ?? "low" },
      });
    } catch (err) {
      // Log the kind of problem, never the message (an auth error can quote part of the key).
      console.error("[agent] model call failed:", err instanceof Error ? err.name : "unknown", (err as { status?: number })?.status ?? "");
      return finish("error", { message: plainError(err) });
    }

    if (response.stop_reason === "refusal") return finish("refused");

    // The API needs the model's whole reply echoed back, unchanged.
    messages.push({ role: "assistant", content: response.content });

    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) {
      if (nudged || modelCalls >= maxSteps) return finish("no_answer");
      nudged = true;
      messages.push({ role: "user", content: `Please finish by calling the ${finalTool} tool.` });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    let final: { value: T } | null = null;
    for (const use of uses) {
      const tool = opts.tools.find((t) => t.name === use.name);
      if (!tool) {
        emit({ label: "Skipping something I can't do…", state: "working" });
        emit({ label: "Skipping something I can't do…", state: "done", detail: "Something asked for a tool that does not exist. It did nothing." });
        results.push({ type: "tool_result", tool_use_id: use.id, content: "That tool does not exist.", is_error: true });
        continue;
      }
      emit({ label: tool.label, state: "working" });
      let out: ToolOutcome<T>;
      try {
        out = await tool.run(use.input);
      } catch {
        out = { content: "That did not work.", isError: true };
      }
      emit({ label: tool.label, state: "done", detail: detailOf(tool.name, use.input, out.content, out.isError) });
      for (const note of out.notes ?? []) emit({ label: note, state: "done", warn: true });
      results.push({ type: "tool_result", tool_use_id: use.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
      if (out.final !== undefined && tool.name === finalTool) final = { value: out.final };
    }
    if (final) return finish("done", { result: final.value });
    messages.push({ role: "user", content: results });
  }

  return finish("max_steps");
}
