import { describe, expect, it } from "vitest";
import { createLimiter } from "./rate-limit";

describe("a simple limit so a loop in the browser can't run up the AI bill", () => {
  it("allows the limit, then says no, then allows again when the window has passed", () => {
    let t = 0;
    const allow = createLimiter(3, 1000, () => t);
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
    t = 999;
    expect(allow()).toBe(false);
    t = 1001;
    expect(allow()).toBe(true);
  });

  it("a refused try does not count against the limit", () => {
    let t = 0;
    const allow = createLimiter(1, 1000, () => t);
    allow();
    for (let i = 0; i < 50; i++) allow();
    t = 1001;
    expect(allow()).toBe(true);
  });
});
