import { describe, expect, it } from "vitest";
import { dialogCloseFrames, dialogOpenFrames, dragOffset, MOTION, navFrames, pressFrames, sheetBackFrames, sheetFrames, shouldDismiss, springSamples } from "./springs";

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

describe("dialog open, close and drag", () => {
  it("a laptop dialog opens from .94 to 1 and stays centred", () => {
    const f = dialogOpenFrames(true);
    expect(f[0].transform).toBe(`translate(-50%, 0) scale(${MOTION.dialog.openScale})`);
    expect(f.at(-1)?.transform).toBe("translate(-50%, 0) scale(1)");
    expect(f[0].opacity).toBe(0);
    expect(f.at(-1)?.opacity).toBe(1);
  });
  it("closing is the open backwards: ends small and faded, never grows first", () => {
    const f = dialogCloseFrames(true);
    expect(f[0].transform).toBe("translate(-50%, 0) scale(1)");
    expect(f.at(-1)?.transform).toBe(`translate(-50%, 0) scale(${MOTION.dialog.openScale})`);
    expect(f.at(-1)?.opacity).toBe(0);
    const scales = f.map((k) => Number(/scale\(([\d.]+)\)/.exec(String(k.transform))?.[1]));
    expect(Math.max(...scales)).toBeLessThanOrEqual(1);
  });
  it("a phone sheet closes by sliding all the way down from where it was dragged to", () => {
    const f = dialogCloseFrames(false, 80);
    expect(f[0].transform).toBe("translateY(calc(80px + (100% - 80px) * 0))");
    expect(f.at(-1)?.transform).toBe("translateY(calc(80px + (100% - 80px) * 1))");
  });
  it("letting go: far or fast closes, a short slow drag springs back", () => {
    expect(shouldDismiss(150, 0)).toBe(true);
    expect(shouldDismiss(50, 1)).toBe(true);
    expect(shouldDismiss(50, 0.1)).toBe(false);
    expect(shouldDismiss(10, 5)).toBe(false);
    const back = sheetBackFrames(100);
    expect(back[0].transform).toBe("translateY(100px)");
    expect(back.at(-1)?.transform).toBe("translateY(0px)");
  });
  it("dragging up only moves it a little", () => {
    expect(dragOffset(100)).toBe(100);
    expect(dragOffset(-100)).toBeCloseTo(-12);
  });
});
