import { describe, expect, it } from "vitest";
import { limitScale } from "./route";

describe("the test-run multiplier for per-person limits", () => {
  it("is 1 unless asked", () => {
    expect(limitScale({ NODE_ENV: "development" })).toBe(1);
    expect(limitScale({ NODE_ENV: "development", NORTH_DEV_RATE_MULTIPLIER: "" })).toBe(1);
  });
  it("scales up while developing", () => {
    expect(limitScale({ NODE_ENV: "development", NORTH_DEV_RATE_MULTIPLIER: "10" })).toBe(10);
    expect(limitScale({ NODE_ENV: "test", NORTH_DEV_RATE_MULTIPLIER: "5" })).toBe(5);
  });
  it("is ignored in production, whatever is set", () => {
    expect(limitScale({ NODE_ENV: "production", NORTH_DEV_RATE_MULTIPLIER: "100" })).toBe(1);
  });
  it.each(["0", "-3", "abc", "1000", "NaN", "Infinity"])("nonsense (%s) means 1", (v) => {
    expect(limitScale({ NODE_ENV: "development", NORTH_DEV_RATE_MULTIPLIER: v })).toBe(1);
  });
});
