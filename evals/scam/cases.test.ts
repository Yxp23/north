import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import { INJECTIONS } from "./injection-cases";
import { extractPricesCents } from "../../src/lib/dealcheck/price-text";
import { fakeBackend } from "./fake-backend";
import { runScamChecker } from "../../src/lib/agents/scam-checker/scam-checker";
import { findHiddenInstructions } from "../../src/lib/injection/scan";
import { reply, scripted, toolUse } from "../../test/fake-model";

// Not a test of the AI. It checks the eval's own data, and that the CODE half gives the expected verdicts when the
// model reads each ad perfectly. (If this fails, a label is wrong, or the verdict code changed.)
describe("the eval data", () => {
  it("has about 30 deal cases and 10 injection listings", () => {
    expect(CASES).toHaveLength(32);
    expect(INJECTIONS).toHaveLength(10);
  });

  it("has unique ids, and covers real deals, fake deals, price traps and unknown sellers", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(new Set(INJECTIONS.map((c) => c.id)).size).toBe(INJECTIONS.length);
    for (const g of ["real deal", "fake deal", "price trap", "unknown seller", "no price", "tricky ad"]) expect(CASES.some((c) => c.group === g), g).toBe(true);
  });

  it("uses only made-up seller addresses (.example), so no real shop is named", () => {
    for (const c of CASES) {
      for (const p of c.products) for (const [domain] of p.offers) expect(domain, c.id).toMatch(/\.example$/);
    }
  });

  it("what a careful reader takes from each ad is really written in it", () => {
    for (const c of CASES) {
      const written = extractPricesCents(c.ad);
      if (c.read.price === null) expect(written, c.id).toEqual([]);
      else {
        expect(written, c.id).toContain(Math.round(c.read.price * 100));
        if (c.read.was !== undefined) expect(written, c.id).toContain(Math.round(c.read.was * 100));
      }
    }
  });

  it("an exact match comes first in the search results", () => {
    for (const c of CASES.filter((c) => c.match === "exact")) expect(c.products.length, c.id).toBeGreaterThanOrEqual(1);
  });

  it("every injection listing really has something hidden in it", () => {
    // the warning scan is only a second layer, but our own cases should trip it (otherwise they are weak examples)
    const missed = INJECTIONS.filter((i) => !findHiddenInstructions(i.description).found).map((i) => i.id);
    expect(missed).toEqual([]);
  });
});

describe("with a perfect reader, the code gives the expected verdict for every case", () => {
  for (const c of CASES) {
    it(`${c.id}: ${c.expected}`, async () => {
      const handles = c.products.map((_, i) => `c${i + 1}`);
      const submit = toolUse("submit_result", {
        claimed_price_dollars: c.read.price,
        claimed_was_price_dollars: c.read.was ?? null,
        seller_domain: null,
        matched_candidate: c.match === "exact" ? "c1" : null,
        similar_candidates: c.match === "similar" ? handles : [],
      });
      const m = scripted([reply([toolUse("search_stores", { query: "x" })]), reply([submit])]);
      const out = await runScamChecker({ client: m.client, backend: fakeBackend(c), ad: { text: c.ad } });
      const got = out.payload.kind === "verdict" ? out.payload.verdict.kind : out.payload.kind;
      expect(got, `${c.id} (${c.why})`).toBe(c.expected);
    });
  }
});
