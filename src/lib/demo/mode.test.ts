import { describe, expect, it } from "vitest";
import { demoAllowed, demoState } from "./mode";

describe("demo tools are off unless a deployment says, out loud, that it is a demo", () => {
  it("are on while developing and testing", () => {
    expect(demoState({ NODE_ENV: "development" })).toMatchObject({ on: true, deployment: false });
    expect(demoState({ NODE_ENV: "test" })).toMatchObject({ on: true });
    expect(demoState({})).toMatchObject({ on: true }); // no NODE_ENV at all is not production
  });

  it("can be turned off while developing", () => {
    expect(demoState({ NODE_ENV: "development", DEMO_MODE: "0" }).on).toBe(false);
  });

  it("are OFF in production by default", () => {
    expect(demoState({ NODE_ENV: "production" })).toMatchObject({ on: false, deployment: false });
  });

  it("are OFF in production with DEMO_MODE=1 alone (the old way of turning them on is not enough)", () => {
    const s = demoState({ NODE_ENV: "production", DEMO_MODE: "1" });
    expect(s.on).toBe(false);
    expect(s.misconfigured).toBe(true);
  });

  it("are OFF in production with only DEMO_DEPLOYMENT=1", () => {
    expect(demoState({ NODE_ENV: "production", DEMO_DEPLOYMENT: "1" }).on).toBe(false);
  });

  it("are on in production only with BOTH DEMO_MODE=1 and DEMO_DEPLOYMENT=1, and then it is labelled a demo deployment", () => {
    expect(demoState({ NODE_ENV: "production", DEMO_MODE: "1", DEMO_DEPLOYMENT: "1" })).toMatchObject({ on: true, deployment: true, misconfigured: false });
  });

  it.each(["true", "yes", "on", "2", " 1", "1 ", "", "TRUE"])("a loose spelling (%j) of the flags does not turn them on in production", (v) => {
    expect(demoState({ NODE_ENV: "production", DEMO_MODE: v, DEMO_DEPLOYMENT: v }).on).toBe(false);
  });

  it("an unknown NODE_ENV that is not 'production' is treated like development only for the two known safe names", () => {
    // 'staging' and friends are NOT production by name, but they could be public: demo tools need the flags there too.
    expect(demoState({ NODE_ENV: "staging" }).on).toBe(false);
    expect(demoState({ NODE_ENV: "staging", DEMO_MODE: "1", DEMO_DEPLOYMENT: "1" }).on).toBe(true);
  });
});

describe("demo tools belong to the practice account only, in a deployed demo", () => {
  const DEMO = "00000000-0000-4000-8000-000000000001";
  const OTHER = "6b1f5b2e-9f43-4a2d-8b6e-0c9f1d2a3b4c";
  const deployed = { NODE_ENV: "production", DEMO_MODE: "1", DEMO_DEPLOYMENT: "1", DEMO_USER_ID: DEMO };

  it("the practice account may use them, a real person's account may not", () => {
    expect(demoAllowed(DEMO, deployed)).toBe(true);
    expect(demoAllowed(OTHER, deployed)).toBe(false);
  });
  it("with no practice account named, nobody may", () => {
    expect(demoAllowed(DEMO, { ...deployed, DEMO_USER_ID: undefined })).toBe(false);
    expect(demoAllowed(DEMO, { ...deployed, DEMO_USER_ID: "" })).toBe(false);
  });
  it("in production without the demo flags, nobody may", () => {
    expect(demoAllowed(DEMO, { NODE_ENV: "production", DEMO_USER_ID: DEMO })).toBe(false);
    expect(demoAllowed(DEMO, { NODE_ENV: "production", DEMO_MODE: "1", DEMO_USER_ID: DEMO })).toBe(false);
  });
  it("while developing, whoever is logged in may", () => {
    expect(demoAllowed(OTHER, { NODE_ENV: "development" })).toBe(true);
    expect(demoAllowed(OTHER, { NODE_ENV: "development", DEMO_MODE: "0" })).toBe(false);
  });
});
