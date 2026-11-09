import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, parsePrefs } from "./appearance";

describe("appearance choices", () => {
  it("defaults to Bloom, and all five themes exist", () => {
    expect(DEFAULT_THEME).toBe("bloom");
    expect(THEMES.map((t) => t.id)).toEqual(["tide", "dune", "grove", "opal", "bloom"]);
    expect(parsePrefs(null)).toEqual({ theme: "bloom", reduce: false, solid: null, behind: false, videoSafe: false });
  });
  it("reads saved choices and ignores anything odd", () => {
    expect(parsePrefs(JSON.stringify({ theme: "opal", reduce: true, solid: true, behind: true, videoSafe: false }))).toEqual({ theme: "opal", reduce: true, solid: true, behind: true, videoSafe: false });
    expect(parsePrefs(JSON.stringify({ theme: "<script>", reduce: "yes", solid: 3 }))).toEqual({ theme: "bloom", reduce: false, solid: null, behind: false, videoSafe: false });
    expect(parsePrefs("{not json")).toEqual({ theme: "bloom", reduce: false, solid: null, behind: false, videoSafe: false });
  });
  it("holds only display choices: no money, rule or permission field", () => {
    expect(Object.keys(parsePrefs(JSON.stringify({ theme: "tide", canBuy: true, token: "secret" }))).sort()).toEqual(["behind", "reduce", "solid", "theme", "videoSafe"]);
  });
});
