import { describe, expect, it } from "vitest";
import { collapseSteps } from "./activity-panel";

const w = (label: string) => ({ label, state: "working" as const });
const d = (label: string) => ({ label, state: "done" as const });

describe("activity panel lines", () => {
  it("shows the step that is being worked on as not done", () => {
    expect(collapseSteps([w("Reading your rule…")])).toEqual([{ label: "Reading your rule…", done: false }]);
  });

  it("joins a step's working and done events into one line", () => {
    expect(collapseSteps([w("Looking…"), d("Looking…")])).toEqual([{ label: "Looking…", done: true }]);
  });

  it("a step that was started is done once the next step begins", () => {
    // The first line (the start label) never gets its own 'done' event.
    expect(collapseSteps([w("Reading your rule…"), w("Looking…"), d("Looking…"), w("Writing it up…")])).toEqual([
      { label: "Reading your rule…", done: true },
      { label: "Looking…", done: true },
      { label: "Writing it up…", done: false },
    ]);
  });

  it("everything is done at the end", () => {
    const lines = collapseSteps([w("Reading your rule…"), w("Writing it up…"), d("Writing it up…"), d("Done.")]);
    expect(lines.every((l) => l.done)).toBe(true);
    expect(lines.map((l) => l.label)).toEqual(["Reading your rule…", "Writing it up…", "Done."]);
  });

  it("an 'I stopped' ending marks the lines done too", () => {
    expect(collapseSteps([w("Reading your rule…"), d("Stopped.")]).every((l) => l.done)).toBe(true);
  });
});
