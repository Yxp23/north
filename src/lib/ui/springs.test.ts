import { describe, expect, it } from "vitest";
import { MOTION, navFrames, pressFrames, sheetFrames, springSamples } from "./springs";

// The handoff's own sampler, read from the file so a change to either one is caught.
async function handoffSampler() {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../../../design/north-design-handoff/tokens/spring-sampler.js", import.meta.url), "utf8").replace("export { springSamples };", "return springSamples;");
  return new Function(src)() as typeof springSamples;
}

describe("springs", () => {
  it("matches the approved sampler exactly for every motion in motion.json", async () => {
    const theirs = await handoffSampler();
    for (const m of [MOTION.press, MOTION.nav, MOTION.sheet]) {
      expect(springSamples(m.durationMs, m.stiffness, m.damping)).toEqual(theirs(m.durationMs, m.stiffness, m.damping));
    }
  });
  it("has 49 frames that start at 0 and settle at exactly 1", () => {
    const s = springSamples(490, 440, 21);
    expect(s).toHaveLength(49);
    expect(s[0].v).toBeCloseTo(0, 6);
    expect(s[48].v).toBe(1);
  });
  it("keeps the dialog centred through its whole entry on a laptop", () => {
    for (const f of sheetFrames(true)) expect(String(f.transform)).toContain("translate(-50%,");
    expect(String(sheetFrames(false)[0].transform)).toBe("translateY(240px)");
  });
  it("starts the press at .955 and the nav from where it was", () => {
    expect(String(pressFrames()[0].transform)).toBe("scale(0.955)");
    expect(String(navFrames(10, 110)[0].transform)).toContain("translateX(10px)");
  });
});
