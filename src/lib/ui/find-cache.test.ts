import { describe, expect, it } from "vitest";
import { normalizeQuery, readFind, readLastResults, rememberResults, resultsUrl, writeFind } from "./find-cache";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("find cache", () => {
  it("treats the same words as the same search", () => {
    expect(normalizeQuery("  Running   Shoes ")).toBe("running shoes");
  });
  it("gives back what was saved, and forgets it after 30 minutes", () => {
    const s = mem();
    writeFind("Running shoes", { answer: { route: "finder" }, events: [], shown: 12 }, 1000, s);
    expect(readFind("running  shoes", 2000, s)?.shown).toBe(12);
    expect(readFind("running shoes", 1000 + 31 * 60 * 1000, s)).toBeNull();
  });
  it("survives blocked storage", () => {
    expect(readFind("x", 0, null)).toBeNull();
    expect(() => writeFind("x", { answer: {}, events: [], shown: 6 }, 0, null)).not.toThrow();
  });
  it("only remembers a results address of our own", () => {
    const s = mem();
    rememberResults({ url: "/find?q=socks", scroll: 420 }, s);
    expect(readLastResults(s)).toEqual({ url: "/find?q=socks", scroll: 420 });
    rememberResults({ url: "https://evil.example", scroll: 1 }, s);
    expect(readLastResults(s)).toBeNull();
  });
  it("builds a readable address", () => {
    expect(resultsUrl("running shoes")).toBe("/find?q=running+shoes");
  });
});
