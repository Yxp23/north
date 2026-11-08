import { describe, expect, it } from "vitest";
import { simulatedPayments } from "./mode";

describe("pretend payments", () => {
  it("are on only when asked for, outside production", () => {
    expect(simulatedPayments({ NODE_ENV: "development", PAYMENTS_MODE: "simulated" })).toBe(true);
    expect(simulatedPayments({ NODE_ENV: "test", PAYMENTS_MODE: "simulated" })).toBe(true);
    expect(simulatedPayments({ NODE_ENV: "development" })).toBe(false);
    expect(simulatedPayments({ NODE_ENV: "development", PAYMENTS_MODE: "real" })).toBe(false);
  });
  it("are NEVER on in production, whatever the settings", () => {
    expect(simulatedPayments({ NODE_ENV: "production", PAYMENTS_MODE: "simulated" })).toBe(false);
    expect(simulatedPayments({ NODE_ENV: "production", PAYMENTS_MODE: "simulated", DEMO_MODE: "1", DEMO_DEPLOYMENT: "1" })).toBe(false);
  });
});
