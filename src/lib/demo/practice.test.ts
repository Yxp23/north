import { afterEach, describe, expect, it, vi } from "vitest";
import { practiceLogin } from "./practice";

const FULL = { DEMO_USER_ID: "00000000-0000-4000-8000-000000000001", DEMO_LOGIN_EMAIL: "judge@x.test", DEMO_LOGIN_PASSWORD: "pw" };

afterEach(() => vi.unstubAllEnvs());

describe("the practice login for 'Try the demo'", () => {
  it("is offered only in the judges' deployed demo (both flags, in production)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DEMO_DEPLOYMENT", "1");
    expect(practiceLogin(FULL)).toEqual({ email: "judge@x.test", password: "pw" });
  });
  it("is not offered with DEMO_MODE alone, or with neither flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");
    expect(practiceLogin(FULL)).toBeNull();
    vi.stubEnv("DEMO_MODE", "");
    expect(practiceLogin(FULL)).toBeNull();
  });
  it("is not offered while developing (demo tools are on there, but it is not a deployed demo)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(practiceLogin(FULL)).toBeNull();
  });
  it("needs the practice account id and login to be set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DEMO_DEPLOYMENT", "1");
    expect(practiceLogin({ ...FULL, DEMO_USER_ID: "" })).toBeNull();
    expect(practiceLogin({ ...FULL, DEMO_LOGIN_PASSWORD: "" })).toBeNull();
  });
});
