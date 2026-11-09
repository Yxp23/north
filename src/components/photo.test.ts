import { describe, expect, it } from "vitest";
import demo from "../../data/demo-products.json";
import { isBrandSafe } from "./photo";

describe("video-safe photos", () => {
  it("keeps the project's own demo pictures and hides everything else", () => {
    for (const p of demo.products as { imageUrl: string }[]) expect(isBrandSafe(p.imageUrl)).toBe(true);
    expect(isBrandSafe("/demo/earbuds.svg")).toBe(true);
    expect(isBrandSafe("https://cdn.trychannel3.com/some-live-result?aid=1")).toBe(false);
    expect(isBrandSafe("https://other.example/photo.jpg")).toBe(false);
  });
});
