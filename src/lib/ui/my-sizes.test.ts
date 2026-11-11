import { describe, expect, it } from "vitest";
import { parseMySizes, shouldOfferToRemember, sizeKindOf, usualSizeFor } from "./my-sizes";

describe("what kind of size is it", () => {
  it("shoes, clothes and rings are recognised; anything else has no size kind", () => {
    expect(sizeKindOf({ category: "shoes" })).toBe("shoes");
    expect(sizeKindOf({ category: "clothes" })).toBe("clothes");
    expect(sizeKindOf({ category: "rings" })).toBe("rings");
    expect(sizeKindOf({ category: "jewelry", name: "Gold Ring" })).toBe("rings");
    expect(sizeKindOf({ category: "electronics", name: "Phone" })).toBeNull();
    expect(sizeKindOf({ category: "household", name: "Bringing it home" })).toBeNull();
  });
});

describe("My sizes", () => {
  it("reads what was saved, and ignores anything odd", () => {
    expect(parseMySizes('{"shoes":"9","clothes":"M"}')).toEqual({ shoes: "9", clothes: "M" });
    expect(parseMySizes('{"shoes":"<script>","clothes":5,"rings":"7"}')).toEqual({});
    expect(parseMySizes("not json")).toEqual({});
    expect(parseMySizes(null)).toEqual({});
  });
  it("your usual size is offered only when this product really has it", () => {
    expect(usualSizeFor({ shoes: "9" }, "shoes", ["8", "9", "10"])).toBe("9");
    expect(usualSizeFor({ shoes: "9" }, "shoes", ["6", "7"])).toBeNull();
    expect(usualSizeFor({ shoes: "9" }, "clothes", ["9"])).toBeNull();
    expect(usualSizeFor({ shoes: "9" }, "rings", ["9"])).toBeNull();
    expect(usualSizeFor({ shoes: "9" }, "shoes", undefined)).toBeNull();
  });
  it("it offers to remember a shoe or clothing size once, when it is new", () => {
    expect(shouldOfferToRemember({}, "shoes", "9")).toBe(true);
    expect(shouldOfferToRemember({ shoes: "9" }, "shoes", "9")).toBe(false);
    expect(shouldOfferToRemember({ shoes: "9" }, "shoes", "10")).toBe(true);
    expect(shouldOfferToRemember({}, "rings", "7")).toBe(false);
    expect(shouldOfferToRemember({}, null, "7")).toBe(false);
    expect(shouldOfferToRemember({}, "shoes", null)).toBe(false);
  });
});
