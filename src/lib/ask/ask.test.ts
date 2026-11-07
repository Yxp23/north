import { describe, expect, it, vi } from "vitest";
import { allowedExtra, runAsk, type Delegates } from "./ask";
import type { StepEvent } from "../agents/loop";
import { reply, scripted, toolUse } from "../../../test/fake-model";

const go = (destination: string) => reply([toolUse("route_to", { destination })]);
function setup() {
  const calls: { route: string; req: { text: string; imageBase64?: string; extra: Record<string, unknown> } }[] = [];
  const mk = (route: string, payload: unknown, stepLabel = `${route} working`) =>
    vi.fn(async (req: { text: string; imageBase64?: string; extra: Record<string, unknown> }, onStep: (e: StepEvent) => void) => {
      calls.push({ route, req });
      onStep({ label: stepLabel, state: "working" });
      onStep({ label: stepLabel, state: "done" });
      return payload;
    });
  const delegates = {
    scam_checker: mk("scam_checker", { kind: "verdict" }),
    finder: mk("finder", { kind: "found" }),
    help_me_choose: mk("help_me_choose", { kind: "picks" }),
    payments: mk("payments", { kind: "answer" }),
  } satisfies Delegates;
  return { delegates, calls };
}
async function ask(replies: Parameters<typeof scripted>[0], input: Parameters<typeof runAsk>[0]["input"]) {
  const m = scripted(replies);
  const s = setup();
  const steps: StepEvent[] = [];
  const out = await runAsk({ client: m.client, input, delegates: s.delegates, onStep: (e) => steps.push(e) });
  return { out, m, steps, ...s };
}

describe("Ask North: the Concierge routes, then the right helper does the work", () => {
  it.each([
    ["scam_checker", "Asking the Scam checker…"],
    ["finder", "Asking the Finder…"],
    ["help_me_choose", "Asking Help me choose…"],
    ["payments", "Asking the Payments helper…"],
  ])("%s: shows the handoff in the activity panel, then runs that helper", async (dest, label) => {
    const { out, steps, calls } = await ask([go(dest)], { text: "some words" });
    expect(out.route).toBe(dest);
    expect(steps.map((s) => s.label)).toContain(label);
    expect(calls.map((c) => c.route)).toEqual([dest]);
  });

  it("the handoff comes AFTER the router's own steps and BEFORE the helper's", async () => {
    const { steps } = await ask([go("scam_checker")], { text: "is it real" });
    const labels = steps.filter((s) => s.state === "working").map((s) => s.label);
    expect(labels.indexOf("Choosing the right helper…")).toBeLessThan(labels.indexOf("Asking the Scam checker…"));
    expect(labels.indexOf("Asking the Scam checker…")).toBeLessThan(labels.indexOf("scam_checker working"));
  });

  it("the helper gets the person's OWN words and picture, never a model rewrite", async () => {
    const { calls } = await ask([go("scam_checker")], { text: "70% off sneakers, only $27", image: { base64: "AAAA", type: "image/png" } });
    expect(calls[0].req).toMatchObject({ text: "70% off sneakers, only $27", imageBase64: "AAAA" });
  });

  it("a rule request opens the rule helper with the person's words; nothing is saved here", async () => {
    const { out, calls } = await ask([go("new_rule")], { text: "don't let me buy big stuff late at night" });
    expect(out).toEqual({ route: "new_rule", payload: { href: `/rules/new?said=${encodeURIComponent("don't let me buy big stuff late at night")}` } });
    expect(calls).toEqual([]);
  });

  it("'none' says kindly that it did not understand", async () => {
    const { out, calls } = await ask([go("none")], { text: "hello" });
    expect(out.route).toBe("none");
    expect((out.payload as { message: string }).message).toMatch(/not sure/i);
    expect(calls).toEqual([]);
  });

  it("a follow-up that names its helper skips the router (no AI call to choose)", async () => {
    const { out, m, calls } = await ask([go("finder")], { text: "x", route: "help_me_choose", extra: { answer: "Socks" } });
    expect(out.route).toBe("help_me_choose");
    expect(m.calls()).toBe(0);
    expect(calls[0].req.extra).toEqual({ answer: "Socks" });
  });

  it("a follow-up can't name 'none', or anything that isn't a helper", async () => {
    const { out } = await ask([go("finder")], { text: "x", route: "checkout" as never });
    expect(out.route).toBe("finder"); // the bad route is ignored, and the router decides
  });

  it("a helper that throws becomes a kind error, not a crash", async () => {
    const m = scripted([go("finder")]);
    const s = setup();
    s.delegates.finder.mockRejectedValueOnce(new Error("boom secret"));
    const out = await runAsk({ client: m.client, input: { text: "x" }, delegates: s.delegates });
    expect(out.route).toBe("error");
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  it("when routing fails, the error is passed on in plain words", async () => {
    const out = (await ask([go("finder")], {})).out;
    expect(out.route).toBe("error");
  });
});

describe("what may be passed on to a helper besides the person's words", () => {
  it("only a price for the Scam checker, and an answer for Help me choose", () => {
    expect(allowedExtra("scam_checker", { priceDollars: 27.5, evil: 1 })).toEqual({ priceDollars: 27.5 });
    expect(allowedExtra("help_me_choose", { answer: "  Socks ", priceDollars: 3 })).toEqual({ answer: "Socks" });
    expect(allowedExtra("finder", { answer: "x", priceDollars: 3 })).toEqual({});
    expect(allowedExtra("payments", { question: "x" })).toEqual({});
  });
  it.each([0, -3, Number.NaN, 1_000_000, "27"])("a price of %j is dropped", (p) => {
    expect(allowedExtra("scam_checker", { priceDollars: p })).toEqual({});
  });
  it("an answer is short plain text", () => {
    expect(allowedExtra("help_me_choose", { answer: "x".repeat(100) })).toEqual({ answer: "x".repeat(60) });
    expect(allowedExtra("help_me_choose", { answer: 5 })).toEqual({});
  });
});
