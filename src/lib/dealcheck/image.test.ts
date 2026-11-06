import { describe, expect, it } from "vitest";
import { checkImage } from "./image";

const b64 = (bytes: number[], pad = 20) => Buffer.from([...bytes, ...Array(pad).fill(0)]).toString("base64");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("checking an uploaded picture before it goes anywhere", () => {
  it.each([
    ["image/png", PNG], ["image/jpeg", JPG], ["image/gif", GIF], ["image/webp", WEBP],
  ] as const)("accepts a real %s", (type, bytes) => {
    expect(checkImage(b64([...bytes]))).toMatchObject({ ok: true, type });
  });

  it("the file's own first bytes decide the type, not what the browser said", () => {
    expect(checkImage(b64(PNG))).toMatchObject({ ok: true, type: "image/png" });
  });

  it.each([
    ["not a picture (text)", Buffer.from("hello world, not an image at all").toString("base64"), "image/png"],
    ["an html page", Buffer.from("<html><script>alert(1)</script></html>").toString("base64"), "image/png"],
    ["an svg", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>").toString("base64"), "image/svg+xml"],
    ["not base64", "***not base64***", "image/png"],
    ["empty", "", "image/png"],
  ])("rejects %s", (_n, data) => {
    expect(checkImage(data).ok).toBe(false);
  });

  it("rejects a picture that is too big", () => {
    const big = Buffer.concat([Buffer.from(PNG), Buffer.alloc(4_100_000)]).toString("base64");
    const r = checkImage(big);
    expect(r).toEqual({ ok: false, message: "That picture is too big. Please try a smaller one." });
  });

  it("strips a data: prefix the browser may have added", () => {
    const r = checkImage(`data:image/png;base64,${b64(PNG)}`);
    expect(r).toMatchObject({ ok: true, base64: b64(PNG) });
  });
});
