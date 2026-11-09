import { describe, expect, it } from "vitest";
import { createMasker } from "./video-safe";

describe("video-safe masker", () => {
  it("gives each store one stable letter, in the order they are first seen", () => {
    const m = createMasker();
    expect(m.store("shop-a.com")).toBe("Store A");
    expect(m.store("www.other.net")).toBe("Store B");
    expect(m.store("SHOP-A.com")).toBe("Store A");
  });
  it("replaces store addresses inside a sentence and leaves prices and other words alone", () => {
    const m = createMasker();
    expect(m.text("Lowest price: $349.00 at bigstore.com. Next: $349.95 at tsave.com, e.g. cheaper.")).toBe("Lowest price: $349.00 at Store A. Next: $349.95 at Store B, e.g. cheaper.");
  });
  it("names products generically and keeps them stable", () => {
    const m = createMasker();
    expect(m.item("Over-Ear Headphones", "electronics")).toBe("Electronics item A");
    expect(m.item("Mild Shampoo")).toBe("Item B");
    expect(m.item("over-ear headphones", "electronics")).toBe("Electronics item A");
    m.reset();
    expect(m.item("Mild Shampoo")).toBe("Item A");
  });
});
