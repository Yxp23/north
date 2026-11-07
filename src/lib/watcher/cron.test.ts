import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron";

describe("who may start the scheduled price check", () => {
  it("someone who sends the secret, the way Vercel cron does", () => {
    expect(isCronAuthorized("Bearer s3cret-value", "s3cret-value")).toBe(true);
  });
  it.each([
    ["wrong secret", "Bearer nope", "s3cret-value"],
    ["no header", null, "s3cret-value"],
    ["not a bearer", "s3cret-value", "s3cret-value"],
    ["empty bearer", "Bearer ", "s3cret-value"],
    ["a longer secret that starts the same", "Bearer s3cret-value-and-more", "s3cret-value"],
    ["a shorter one", "Bearer s3cret", "s3cret-value"],
  ])("not %s", (_n, header, secret) => expect(isCronAuthorized(header, secret)).toBe(false));
  it("nobody when no secret is set (the scheduled check is simply off)", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
  });
});
