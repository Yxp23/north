import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore } from "./index";
import { DemoStore } from "./demo-store";
import { LiveStore } from "./live-store";

afterEach(() => vi.unstubAllEnvs());

describe("which store the app uses", () => {
  it("the live store when there is a Channel3 key", () => {
    vi.stubEnv("CHANNEL3_API_KEY", "k");
    vi.stubEnv("STORE_MODE", "");
    expect(getStore()).toBeInstanceOf(LiveStore);
  });
  it("just the demo products without a key", () => {
    vi.stubEnv("CHANNEL3_API_KEY", "");
    expect(getStore()).toBeInstanceOf(DemoStore);
  });
  it("STORE_MODE=demo keeps to the demo products even with a key (for the video: no real brands can show up)", () => {
    vi.stubEnv("CHANNEL3_API_KEY", "k");
    vi.stubEnv("STORE_MODE", "demo");
    expect(getStore()).toBeInstanceOf(DemoStore);
  });
});
