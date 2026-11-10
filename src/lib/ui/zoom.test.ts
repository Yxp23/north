import { describe, expect, it } from "vitest";
import { clampView, doubleTap, FIT, MAX_SCALE, swipeDirection, wheelFactor, zoomAbout } from "./zoom";

const img = { w: 400, h: 300 };
const stage = { w: 800, h: 600 };

describe("photo zoom", () => {
  it("never zooms out past fitting the screen, or in past the maximum", () => {
    expect(clampView({ scale: 0.4, x: 50, y: 50 }, img, stage)).toEqual(FIT);
    expect(clampView({ scale: 99, x: 0, y: 0 }, img, stage).scale).toBe(MAX_SCALE);
  });
  it("can't be dragged so far that empty space shows", () => {
    // 4x zoom: the picture is 1600 wide on an 800 screen, so it can move at most 400 either way.
    expect(clampView({ scale: 4, x: 9999, y: -9999 }, img, stage)).toMatchObject({ x: 400, y: -300 });
  });
  it("a picture smaller than the screen even when zoomed stays centred", () => {
    expect(clampView({ scale: 1.5, x: 80, y: 80 }, img, stage)).toMatchObject({ x: 0, y: 0 });
  });
  it("keeps the point under the finger in place", () => {
    const v = zoomAbout({ scale: 2, x: 0, y: 0 }, 4, { x: 100, y: 50 }, { w: 800, h: 600 }, stage);
    expect(v.x).toBeCloseTo(-100); // the spot that was at x=100 is still at x=100 on screen
    expect(v.y).toBeCloseTo(-50);
  });
  it("double tap zooms in, then back out", () => {
    const zoomed = doubleTap(FIT, { x: 0, y: 0 }, { w: 800, h: 600 }, stage);
    expect(zoomed.scale).toBe(2.5);
    expect(doubleTap(zoomed, { x: 0, y: 0 }, img, stage)).toEqual(FIT);
  });
  it("wheel: down zooms out, up zooms in", () => {
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100)).toBeGreaterThan(1);
  });
  it("a swipe needs to be long enough and mostly sideways", () => {
    expect(swipeDirection(-90, 10)).toBe(1);
    expect(swipeDirection(90, 10)).toBe(-1);
    expect(swipeDirection(30, 0)).toBe(0);
    expect(swipeDirection(70, 80)).toBe(0);
  });
});
