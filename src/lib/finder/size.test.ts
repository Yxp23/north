import { describe, expect, it } from "vitest";
import { normalizeSize, sizeMatch } from "./size";
import type { ShelfItem } from "./types";

const item = (sizes?: string[]): ShelfItem => ({ id: "x", name: "n", category: "c", imageUrl: "https://i/x.jpg", priceCents: 100, domain: "a.com", storeCount: 1, sizes });

describe("sizes", () => {
  it.each([
    ["8", "8"], [" Size 8 ", "8"], ["8.0", "8"], ["8.5", "8.5"], ["M", "m"], ["Medium", "m"], ["extra large", "xl"], ["XL", "xl"], ["Small", "s"], ["10 W", "10 w"], ["US 9", "9"],
  ])("%j is %j", (a, b) => expect(normalizeSize(a)).toBe(b));

  it("yes when the product comes in that size", () => {
    expect(sizeMatch(item(["7", "8", "9"]), "size 8")).toBe("yes");
    expect(sizeMatch(item(["S", "M", "L"]), "medium")).toBe("yes");
  });
  it("no when the product has sizes and not that one", () => {
    expect(sizeMatch(item(["7", "9"]), "8")).toBe("no");
  });
  it("unknown when the product has no size choice (a towel, a kettle)", () => {
    expect(sizeMatch(item(undefined), "8")).toBe("unknown");
  });
  it("unknown when the size asked for is empty", () => {
    expect(sizeMatch(item(["7"]), "  ")).toBe("unknown");
  });
});
