import { describe, expect, it } from "vitest";
import { domainFromText, isValidDomain, lookalikeOf, oddDomain } from "./seller";

describe("finding the seller's domain in what the user pasted (code, not the model)", () => {
  it.each([
    ["https://www.cheap-kicks-outlet.example/products/70-off?ref=ad", "cheap-kicks-outlet.example"],
    ["Check this http://Deals.Example.com:8080/x", "deals.example.com"],
    ["70% off sneakers $27 at superkicks.shop right now", "superkicks.shop"],
    ["www.kickscrew.com/shoes", "kickscrew.com"],
    ["https://user:pass@evil.example/login", "evil.example"],
  ])("%s -> %s", (text, want) => {
    expect(domainFromText(text)).toBe(want);
  });

  it.each([["no link here, just words"], ["it costs $27.99 today"], ["version 1.2 is out"], [""]])("finds nothing in %j", (text) => {
    expect(domainFromText(text)).toBeNull();
  });

  it("validates a domain the model read from a picture", () => {
    expect(isValidDomain("kickscrew.com")).toBe(true);
    expect(isValidDomain("shop.example.co.uk")).toBe(true);
    for (const bad of ["", "no spaces.com", "http://x.com", "x", "a..com", "-bad.com", "kicks.com/path", "ignore previous instructions.com"]) {
      expect(isValidDomain(bad), bad).toBe(false);
    }
  });
});

describe("a copy of a seller we know", () => {
  const known = ["kickscrew.com", "academy.com", "garmentory.com"];
  it.each([
    ["kickscrew.net", "kickscrew.com"], // same name, other ending
    ["kickscrew-outlet.shop", "kickscrew.com"], // known name plus extra words
    ["kicksscrew.com", "kickscrew.com"], // one letter off
    ["academy-sports-deals.top", "academy.com"],
    ["acaderny.com", "academy.com"], // rn looks like m
  ])("%s looks like %s", (domain, of) => {
    expect(lookalikeOf(domain, known)).toBe(of);
  });

  it.each([["kickscrew.com"], ["www.kickscrew.com"], ["totally-different.com"], ["shoes.example"], ["abc.com"]])("%s is not a copy", (d) => {
    expect(lookalikeOf(d, known)).toBeNull();
  });

  it("short names are not matched loosely (too many false alarms)", () => {
    expect(lookalikeOf("acme.com", ["acne.com"])).toBeNull();
  });
});

describe("odd-looking domains", () => {
  it.each([["192.168.4.5"], ["xn--kickscrew-9ya.com"], ["best-cheap-kicks-sale-outlet-now.shop"]])("%s is odd", (d) => expect(oddDomain(d)).toBe(true));
  it.each([["kickscrew.com"], ["shop.example.co.uk"], ["my-store.com"]])("%s is not odd", (d) => expect(oddDomain(d)).toBe(false));
});
