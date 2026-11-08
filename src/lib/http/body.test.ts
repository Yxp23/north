import { describe, expect, it } from "vitest";
import { readJson } from "./body";

const post = (body: string, headers: Record<string, string> = {}) => new Request("http://x/", { method: "POST", body, headers });

describe("readJson", () => {
  it("reads JSON", async () => expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 }));
  it("returns null for bad JSON and empty bodies", async () => {
    expect(await readJson(post("{nope"))).toBeNull();
    expect(await readJson(post(""))).toBeNull();
  });
  it("returns null when the body is bigger than the cap, by header or by size", async () => {
    expect(await readJson(post("x".repeat(100)), 50)).toBeNull();
    expect(await readJson(post('{"a":1}', { "content-length": "999999" }), 50)).toBeNull();
    expect(await readJson(post(JSON.stringify({ a: "y".repeat(100) })), 50)).toBeNull();
  });
});
