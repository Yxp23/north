import { describe, expect, it } from "vitest";
import { TOO_MANY } from "../ratelimit/route";
import { isRateLimitMessage, LOGIN_RATE_LIMIT_MESSAGE, RATE_LIMIT_MESSAGE } from "./rate-limit";

describe("rate-limit wording", () => {
  it("says it calmly and specifically, and never sounds like a failure", () => {
    expect(RATE_LIMIT_MESSAGE).toBe("Lots of people are trying North right now. Try again in a minute.");
    for (const m of [RATE_LIMIT_MESSAGE, LOGIN_RATE_LIMIT_MESSAGE]) {
      expect(m).not.toMatch(/did not work|went wrong|error|failed/i);
      expect(isRateLimitMessage(m)).toBe(true);
    }
  });
  it("is what the server sends for every per-person limit", () => {
    expect(TOO_MANY).toBe(RATE_LIMIT_MESSAGE);
  });
  it("only recognises its own sentences", () => {
    expect(isRateLimitMessage("That did not work.")).toBe(false);
    expect(isRateLimitMessage(undefined)).toBe(false);
  });
});
