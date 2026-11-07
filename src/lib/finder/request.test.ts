import { describe, expect, it } from "vitest";
import { parseFinderRequest } from "./request";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(30).fill(0)]).toString("base64");

describe("reading what the browser sent to a Finder route", () => {
  it("words only", () => {
    expect(parseFinderRequest({ text: "  warm socks " }, { maxChars: 100 })).toEqual({ ok: true, text: "warm socks" });
  });
  it("a picture is checked by its first bytes and given its real type", () => {
    expect(parseFinderRequest({ imageBase64: PNG }, { maxChars: 100 })).toMatchObject({ ok: true, text: "", image: { type: "image/png" } });
  });
  it("something that is not a picture is turned away", () => {
    const r = parseFinderRequest({ imageBase64: Buffer.from("<html>").toString("base64") }, { maxChars: 100 });
    expect(r.ok).toBe(false);
  });
  it("nothing at all is turned away, with kind words", () => {
    const r = parseFinderRequest({}, { maxChars: 100 });
    expect(r).toMatchObject({ ok: false });
    expect(parseFinderRequest(null, { maxChars: 100 }).ok).toBe(false);
  });
  it("too many words is turned away", () => {
    expect(parseFinderRequest({ text: "x".repeat(101) }, { maxChars: 100 }).ok).toBe(false);
  });
  it("words that are not text are ignored", () => {
    expect(parseFinderRequest({ text: 42 }, { maxChars: 100 }).ok).toBe(false);
  });
  it("a picture can be required", () => {
    expect(parseFinderRequest({ text: "socks" }, { maxChars: 100, requireImage: true })).toMatchObject({ ok: false });
  });
});
