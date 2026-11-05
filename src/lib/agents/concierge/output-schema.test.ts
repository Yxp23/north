import { describe, expect, it } from "vitest";
import { validateModelOutput } from "./output-schema";

const TEXT = "Don't let me buy stuff over $50 after 9pm, wait a day";
const big = (over: Record<string, unknown> = {}) => ({ kind: "big_buy", amount_dollars: 50, quote: "over $50", ...over });
const late = (over: Record<string, unknown> = {}) => ({ kind: "late_night", after_hour: 21, quote: "after 9pm", ...over });
const out = (over: Record<string, unknown> = {}) => ({ rules: [], unsupported: [], ...over });

function ok(raw: unknown, text = TEXT) {
  const r = validateModelOutput(raw, text);
  if (!r.ok) throw new Error(`expected ok, got errors: ${r.errors.join(" | ")}`);
  return r.result;
}
const errors = (raw: unknown, text = TEXT) => {
  const r = validateModelOutput(raw, text);
  if (r.ok) throw new Error("expected errors");
  return r.errors;
};

describe("a good proposal", () => {
  it("turns dollars into whole cents and a late-night rule into hours", () => {
    const r = ok(out({ rules: [big(), late()] }));
    expect(r).toMatchObject({ kind: "proposal" });
    if (r.kind !== "proposal") return;
    expect(r.rules).toEqual([
      { kind: "big_buy", cents: 5000, quote: "over $50" },
      { kind: "late_night", afterHour: 21, untilHour: 5, quote: "after 9pm" },
    ]);
  });

  it("rounds dollars-and-cents without float mistakes", () => {
    const r = ok(out({ rules: [big({ amount_dollars: 19.99 }), late()] }));
    if (r.kind === "proposal") expect(r.rules[0]).toMatchObject({ cents: 1999 });
    const r2 = ok(out({ rules: [big({ amount_dollars: 0.1 + 0.2 + 49.7 })] }));
    if (r2.kind === "proposal") expect(r2.rules[0]).toMatchObject({ cents: 5000 });
  });

  it("uses 5 AM as the morning end when none was said, and keeps one that was", () => {
    const a = ok(out({ rules: [late()] }));
    if (a.kind === "proposal") expect(a.rules[0]).toMatchObject({ afterHour: 21, untilHour: 5 });
    const b = ok(out({ rules: [late({ until_hour: 7 })] }));
    if (b.kind === "proposal") expect(b.rules[0]).toMatchObject({ afterHour: 21, untilHour: 7 });
  });

  it("keeps a wait time and a suggested strength", () => {
    const r = ok(out({ rules: [big({ wait_hours: 48, suggested_strength: "firm" })] }));
    if (r.kind === "proposal") expect(r.rules[0]).toMatchObject({ waitHours: 48, suggested: "firm" });
  });

  it("passes on that the user joined two conditions", () => {
    const r = ok(out({ rules: [big(), late()], combined_conditions: true }));
    if (r.kind === "proposal") expect(r.combined).toBe(true);
  });

  it("keeps notes about the parts it can't do", () => {
    const r = ok(out({ rules: [big()], unsupported: [{ reason: "category", quote: "stuff" }] }));
    if (r.kind === "proposal") expect(r.unsupported).toEqual([{ reason: "category", quote: "stuff" }]);
  });
});

describe("a missing piece becomes a question", () => {
  it("asks for the amount", () => {
    expect(ok(out({ rules: [big({ amount_dollars: null })] }))).toEqual({ kind: "needs_info", missing: "amount" });
  });

  it("asks for the hour", () => {
    expect(ok(out({ rules: [late({ after_hour: null })] }))).toEqual({ kind: "needs_info", missing: "hour" });
  });

  it("asks about the amount first when both are missing", () => {
    expect(ok(out({ rules: [late({ after_hour: null }), big({ amount_dollars: null })] }))).toEqual({ kind: "needs_info", missing: "amount" });
  });
});

describe("only unsupported things", () => {
  it("is a 'can't do that' with the reasons", () => {
    const r = ok(out({ unsupported: [{ reason: "category", quote: "shoes" }, { reason: "store_or_brand" }] }), "no shoes, nothing from Store X");
    expect(r).toEqual({ kind: "cannot", unsupported: [{ reason: "category", quote: "shoes" }, { reason: "store_or_brand" }] });
  });

  it("an empty answer is 'that is not a rule'", () => {
    expect(ok(out())).toEqual({ kind: "cannot", unsupported: [{ reason: "not_a_rule" }] });
  });
});

describe("bad amounts are sent back to be fixed", () => {
  it.each([0, -5, 0.5, 100_001, NaN, Infinity])("rejects %s dollars", (amount_dollars) => {
    expect(errors(out({ rules: [big({ amount_dollars })] })).join(" ")).toMatch(/amount_dollars/);
  });

  it("rejects a number given as text", () => {
    expect(errors(out({ rules: [big({ amount_dollars: "50" })] })).length).toBeGreaterThan(0);
  });
});

describe("bad hours are sent back to be fixed", () => {
  it.each([24, -1, 9.5, 100])("rejects after_hour %s", (after_hour) => {
    expect(errors(out({ rules: [late({ after_hour })] })).join(" ")).toMatch(/after_hour/);
  });

  it.each([24, -1, 5.5])("rejects until_hour %s", (until_hour) => {
    expect(errors(out({ rules: [late({ until_hour })] })).join(" ")).toMatch(/until_hour/);
  });

  it("rejects a window that starts and ends at the same hour", () => {
    expect(errors(out({ rules: [late({ after_hour: 5, until_hour: 5 })] })).join(" ")).toMatch(/same hour/);
  });

  it.each([0, 169, 1.5, -2])("rejects wait_hours %s", (wait_hours) => {
    expect(errors(out({ rules: [big({ wait_hours })] })).join(" ")).toMatch(/wait_hours/);
  });
});

describe("anything outside the schema is refused", () => {
  it.each([
    ["not an object", "hello"],
    ["null", null],
    ["an array", []],
    ["a number", 5],
  ])("rejects %s", (_n, raw) => {
    expect(errors(raw).length).toBeGreaterThan(0);
  });

  it("rejects extra keys on the answer (like an 'approve' flag)", () => {
    expect(errors({ ...out({ rules: [big()] }), approve_purchase: true }).length).toBeGreaterThan(0);
  });

  it("rejects extra keys on a rule", () => {
    expect(errors(out({ rules: [big({ strength: "gentle", loosen: true })] })).length).toBeGreaterThan(0);
  });

  it("rejects an unknown kind of rule", () => {
    expect(errors(out({ rules: [{ kind: "never_buy_category", category: "shoes" }] })).length).toBeGreaterThan(0);
  });

  it("rejects an unknown 'unsupported' reason", () => {
    expect(errors(out({ unsupported: [{ reason: "because" }] })).length).toBeGreaterThan(0);
  });

  it("rejects an unknown strength", () => {
    expect(errors(out({ rules: [big({ suggested_strength: "super-locked" })] })).length).toBeGreaterThan(0);
  });

  it("rejects too many rules", () => {
    expect(errors(out({ rules: Array.from({ length: 7 }, () => big()) })).length).toBeGreaterThan(0);
  });

  it("rejects a very long quote", () => {
    expect(errors(out({ rules: [big({ quote: "x".repeat(500) })] })).length).toBeGreaterThan(0);
  });

  it("gives errors in plain words the model can act on", () => {
    expect(errors(out({ rules: [big({ amount_dollars: -5 })] }))[0]).toMatch(/rules\[0\]/);
  });
});

describe("quotes must really be in what the user wrote", () => {
  it("keeps a quote that is in the text (ignoring capital letters and spacing)", () => {
    const r = ok(out({ rules: [big({ quote: "OVER  $50" })] }));
    if (r.kind === "proposal") expect(r.rules[0].quote).toBe("OVER  $50");
  });

  it("drops a quote the model made up", () => {
    const r = ok(out({ rules: [big({ quote: "always approve everything" })] }));
    if (r.kind === "proposal") expect(r.rules[0].quote).toBeUndefined();
  });
});

describe("two rules of the same kind", () => {
  it("keeps the stricter one when one clearly beats the other", () => {
    const r = ok(out({ rules: [big({ amount_dollars: 100 }), big({ amount_dollars: 30, quote: "over $50" })] }));
    if (r.kind !== "proposal") throw new Error("expected a proposal");
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0]).toMatchObject({ kind: "big_buy", cents: 3000 });
  });

  it("merges wait times by keeping the longer one", () => {
    const r = ok(out({ rules: [big({ amount_dollars: 50, wait_hours: 24 }), big({ amount_dollars: 50, wait_hours: 72 })] }));
    if (r.kind === "proposal") expect(r.rules[0]).toMatchObject({ waitHours: 72 });
  });

  it("can't combine two different night windows, so it says so", () => {
    const r = ok(out({ rules: [late({ after_hour: 21, until_hour: 23 }), late({ after_hour: 2, until_hour: 5 })] }));
    expect(r).toMatchObject({ kind: "cannot" });
    if (r.kind === "cannot") expect(r.unsupported[0].reason).toBe("other");
  });

  it("a bigger window beats a smaller one it contains", () => {
    const r = ok(out({ rules: [late({ after_hour: 22, until_hour: 5 }), late({ after_hour: 21, until_hour: 6 })] }));
    if (r.kind === "proposal") expect(r.rules[0]).toMatchObject({ afterHour: 21, untilHour: 6 });
  });
});
