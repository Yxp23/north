import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderDecisionTable } from "./decision-table";

const DOC = path.resolve(__dirname, "../../../docs/guardian-decision-table.md");

describe("docs/guardian-decision-table.md", () => {
  if (process.env.UPDATE_DOCS === "1") {
    it("is rewritten from the real Guardian", () => {
      writeFileSync(DOC, renderDecisionTable());
    });
  }

  it("matches what the Guardian really does right now", () => {
    expect(readFileSync(DOC, "utf8")).toBe(renderDecisionTable());
  });

  it("says the things the rules promise", () => {
    const t = renderDecisionTable();
    expect(t).toContain("Wait, or buy now?");
    expect(t).toContain("I saved it. I'll remind you tomorrow.");
    expect(t).toContain("You said never buy this kind of thing. To change that, edit your rule. It takes a day.");
    expect(t).toContain("This seller looks like a scam");
  });
});
