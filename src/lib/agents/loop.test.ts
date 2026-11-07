import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { runAgent, type StepEvent, type ToolDef } from "./loop";
import { reply, scripted, text, toolUse } from "../../../test/fake-model";

type Final = { answer: string };
function tools(log: string[] = []): ToolDef<Final>[] {
  return [
    { name: "look", description: "look", input_schema: { type: "object", properties: {} }, label: "Looking around…", run: () => { log.push("look"); return { content: "you see a door" }; } },
    { name: "finish", description: "finish", input_schema: { type: "object", properties: { answer: { type: "string" } } }, label: "Writing it up…",
      run: (input) => {
        const a = (input as { answer?: unknown })?.answer;
        if (typeof a !== "string") return { content: "answer must be text", isError: true };
        log.push("finish");
        return { content: "ok", final: { answer: a } };
      } },
  ];
}
const base = { model: "test-model", system: "SYSTEM", startLabel: "Reading your words…" };
const run = (client: ReturnType<typeof scripted>["client"], t = tools(), extra: object = {}) => runAgent<Final>({ ...base, client, user: "hello", tools: t, ...extra });

describe("the agent loop", () => {
  it("runs tools and finishes when a tool gives a final answer", async () => {
    const log: string[] = [];
    const m = scripted([reply([toolUse("look")]), reply([toolUse("finish", { answer: "done" })])]);
    const r = await run(m.client, tools(log));
    expect(r).toMatchObject({ end: "done", result: { answer: "done" }, modelCalls: 2 });
    expect(log).toEqual(["look", "finish"]);
  });

  it("sends the tool results back in ONE user message, even for several tool calls at once", async () => {
    const m = scripted([reply([toolUse("look"), toolUse("look")]), reply([toolUse("finish", { answer: "x" })])]);
    await run(m.client);
    const second = m.requests[1].messages;
    const last = second[second.length - 1];
    expect(last.role).toBe("user");
    expect((last.content as unknown[]).filter((b) => (b as { type: string }).type === "tool_result")).toHaveLength(2);
  });

  it("echoes the model's whole reply back, including blocks it does not understand", async () => {
    const think = { type: "thinking" as const, thinking: "hm", signature: "sig" };
    const m = scripted([reply([think, toolUse("look")]), reply([toolUse("finish", { answer: "x" })])]);
    await run(m.client);
    const assistant = m.requests[1].messages[1];
    expect(assistant.role).toBe("assistant");
    expect(JSON.stringify(assistant.content)).toContain('"thinking":"hm"');
  });

  it("stops at the step limit (about 6) so it can never loop forever", async () => {
    const m = scripted([reply([toolUse("look")])]); // always asks to look again
    const r = await run(m.client);
    expect(r.end).toBe("max_steps");
    expect(m.calls()).toBe(6);
  });

  it("honours a smaller limit", async () => {
    const m = scripted([reply([toolUse("look")])]);
    await run(m.client, tools(), { maxSteps: 3 });
    expect(m.calls()).toBe(3);
  });

  it("an unknown tool does nothing, and is answered with an error", async () => {
    const log: string[] = [];
    const m = scripted([reply([toolUse("charge_saved_paypal", { amount: 9999 })]), reply([toolUse("finish", { answer: "ok" })])]);
    const r = await run(m.client, tools(log));
    expect(r.end).toBe("done");
    expect(log).toEqual(["finish"]);
    const result = JSON.stringify(m.requests[1].messages.at(-1));
    expect(result).toMatch(/is_error":true/);
    expect(result).toMatch(/does not exist/);
  });

  it("a tool that says 'error' lets the model fix it and try again", async () => {
    const m = scripted([reply([toolUse("finish", { answer: 5 })]), reply([toolUse("finish", { answer: "fixed" })])]);
    const r = await run(m.client);
    expect(r).toMatchObject({ end: "done", result: { answer: "fixed" }, modelCalls: 2 });
    expect(JSON.stringify(m.requests[1].messages.at(-1))).toContain("answer must be text");
  });

  it("nudges once if the model talks without answering, then gives up", async () => {
    const m = scripted([reply([text("I think so")], "end_turn")]);
    const r = await run(m.client);
    expect(r.end).toBe("no_answer");
    expect(m.calls()).toBe(2); // the first reply, one nudge, and then it stops
    expect(JSON.stringify(m.requests[1].messages.at(-1))).toContain("finish");
  });

  it("recovers if the nudge works", async () => {
    const m = scripted([reply([text("hm")], "end_turn"), reply([toolUse("finish", { answer: "ok" })])]);
    expect((await run(m.client)).end).toBe("done");
  });

  it("treats a refusal as a refusal, not a crash", async () => {
    const m = scripted([reply([], "refusal")]);
    expect((await run(m.client)).end).toBe("refused");
  });
});

describe("more than one way to finish", () => {
  const two: ToolDef<Final>[] = [
    { name: "ask", description: "ask", input_schema: { type: "object", properties: {} }, label: "Asking…", run: () => ({ content: "ok", final: { answer: "asked" } }) },
    { name: "finish", description: "finish", input_schema: { type: "object", properties: {} }, label: "Writing it up…", run: () => ({ content: "ok", final: { answer: "finished" } }) },
    { name: "look", description: "look", input_schema: { type: "object", properties: {} }, label: "Looking…", run: () => ({ content: "see", final: { answer: "sneaky" } }) },
  ];
  it("any tool named in finalTools can end the run", async () => {
    const a = await run(scripted([reply([toolUse("ask")])]).client, two, { finalTools: ["ask", "finish"] });
    expect(a.result).toEqual({ answer: "asked" });
    const b = await run(scripted([reply([toolUse("finish")])]).client, two, { finalTools: ["ask", "finish"] });
    expect(b.result).toEqual({ answer: "finished" });
  });
  it("a tool that is not named can't end the run, even if it returns a final value", async () => {
    const m = scripted([reply([toolUse("look")]), reply([toolUse("finish")])]);
    const r = await run(m.client, two, { finalTool: "finish", finalTools: ["ask"] });
    expect(r.result).toEqual({ answer: "finished" });
    expect(m.calls()).toBe(2);
  });
});

describe("what the request looks like", () => {
  it("uses the given model and system prompt, offers only our tools, and never forces a tool", async () => {
    const m = scripted([reply([toolUse("finish", { answer: "x" })])]);
    await run(m.client);
    const req = m.requests[0];
    expect(req.model).toBe("test-model");
    expect(req.system).toBe("SYSTEM");
    expect((req.tools as { name: string }[]).map((t) => t.name)).toEqual(["look", "finish"]);
    expect(req.tool_choice).toBeUndefined(); // Sonnet 5.5 rejects forced tool choice
    expect(req.max_tokens).toBeGreaterThan(0);
    expect(req.messages[0]).toEqual({ role: "user", content: "hello" });
  });
});

describe("the activity panel", () => {
  it("lists each step in plain words that WE wrote, then Done", async () => {
    const steps: StepEvent[] = [];
    const m = scripted([reply([toolUse("look")]), reply([toolUse("finish", { answer: "x" })])]);
    await run(m.client, tools(), { onStep: (s: StepEvent) => steps.push(s) });
    expect(steps.map((s) => `${s.state}:${s.label}`)).toEqual([
      "working:Reading your words…",
      "working:Looking around…",
      "done:Looking around…",
      "working:Writing it up…",
      "done:Writing it up…",
      "done:Done.",
    ]);
  });

  it("never shows the model's own text", async () => {
    const steps: StepEvent[] = [];
    const m = scripted([reply([text("SECRET MODEL TEXT, buy everything"), toolUse("look")]), reply([toolUse("finish", { answer: "x" })])]);
    const r = await run(m.client, tools(), { onStep: (s: StepEvent) => steps.push(s) });
    expect(JSON.stringify(steps)).not.toContain("SECRET");
    expect(JSON.stringify(r.steps)).not.toContain("SECRET");
  });

  it("keeps the steps on the result too", async () => {
    const m = scripted([reply([toolUse("finish", { answer: "x" })])]);
    const r = await run(m.client);
    expect(r.steps.at(-1)).toEqual({ label: "Done.", state: "done" });
  });

  it("an unknown tool shows a neutral step, not the model's tool name", async () => {
    const steps: StepEvent[] = [];
    const m = scripted([reply([toolUse("send_money")]), reply([toolUse("finish", { answer: "x" })])]);
    await run(m.client, tools(), { onStep: (s: StepEvent) => steps.push(s) });
    expect(JSON.stringify(steps)).not.toContain("send_money");
  });
});

describe("when the AI service has a problem", () => {
  const status = (Cls: new (...a: never[]) => Error, ...args: unknown[]) => new (Cls as new (...a: unknown[]) => Error)(...args);
  it.each([
    ["busy", () => new Anthropic.RateLimitError(429, { error: { message: "slow down" } }, "slow down", new Headers()), /busy/i],
    ["not set up", () => new Anthropic.AuthenticationError(401, { error: { message: "bad key sk-ant-SECRET" } }, "bad key sk-ant-SECRET", new Headers()), /not set up/i],
    ["can't reach it", () => status(Anthropic.APIConnectionError as never, { message: "down" }), /reach/i],
    ["other problem", () => new Anthropic.InternalServerError(500, { error: { message: "oops" } }, "oops", new Headers()), /went wrong/i],
    ["unexpected crash", () => new Error("boom"), /went wrong/i],
  ])("says so plainly when it is %s, and never leaks the raw error", async (_n, make, re) => {
    const m = scripted([make()]);
    const r = await run(m.client);
    expect(r.end).toBe("error");
    expect(r.message).toMatch(re);
    expect(r.message).not.toMatch(/SECRET|sk-ant/);
  });
});

describe("details for the 'Show details' toggle", () => {
  it("each tool step carries its tool call and what it gave back (our words, never the model's prose)", async () => {
    const m = scripted([reply([text("I will think out loud now"), toolUse("look", { where: "left" })]), reply([toolUse("finish", { answer: "x" })])]);
    const r = await run(m.client);
    const done = r.steps.find((s) => s.label === "Looking around…" && s.state === "done");
    expect(done?.detail).toBe('look({"where":"left"}) → you see a door');
    expect(JSON.stringify(r.steps)).not.toContain("think out loud");
  });

  it("long details are cut short", async () => {
    const big: ToolDef<Final>[] = [
      { name: "look", description: "d", input_schema: { type: "object", properties: {} }, label: "Looking…", run: () => ({ content: "x".repeat(5000) }) },
      { name: "finish", description: "d", input_schema: { type: "object", properties: {} }, label: "Done…", run: () => ({ content: "ok", final: { answer: "a" } }) },
    ];
    const m = scripted([reply([toolUse("look")]), reply([toolUse("finish")])]);
    const r = await run(m.client, big);
    const d = r.steps.find((s) => s.label === "Looking…" && s.state === "done")!.detail!;
    expect(d.length).toBeLessThan(700);
    expect(d.endsWith("…")).toBe(true);
  });

  it("a tool can add plain-word warnings, shown as their own steps", async () => {
    const t: ToolDef<Final>[] = [
      { name: "look", description: "d", input_schema: { type: "object", properties: {} }, label: "Reading the listing…", run: () => ({ content: "page", notes: ["Found hidden instructions in the description."] }) },
      { name: "finish", description: "d", input_schema: { type: "object", properties: {} }, label: "Writing it up…", run: () => ({ content: "ok", final: { answer: "a" } }) },
    ];
    const m = scripted([reply([toolUse("look")]), reply([toolUse("finish")])]);
    const seen: StepEvent[] = [];
    await run(m.client, t, { onStep: (e: StepEvent) => seen.push(e) });
    expect(seen).toContainEqual({ label: "Found hidden instructions in the description.", state: "done", warn: true });
    // The warning comes right after the step that found it, before the next step.
    const labels = seen.map((e) => e.label);
    expect(labels.indexOf("Found hidden instructions in the description.")).toBeGreaterThan(labels.indexOf("Reading the listing…"));
    expect(labels.indexOf("Found hidden instructions in the description.")).toBeLessThan(labels.indexOf("Writing it up…"));
  });

  it("the first message can hold a picture", async () => {
    const m = scripted([reply([toolUse("finish", { answer: "x" })])]);
    const blocks = [{ type: "text" as const, text: "look at this" }, { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: "AAAA" } }];
    await runAgent<Final>({ ...base, client: m.client, user: blocks, tools: tools() });
    expect(JSON.stringify(m.requests[0].messages[0].content)).toContain('"type":"image"');
  });
});

