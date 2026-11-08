import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./headers";

describe("security headers", () => {
  const prod = securityHeaders({ production: true });
  const dev = securityHeaders({ production: false });

  it("block framing, sniffing and plugins", () => {
    expect(prod["X-Frame-Options"]).toBe("DENY");
    expect(prod["X-Content-Type-Options"]).toBe("nosniff");
    expect(prod["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(prod["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(prod["Content-Security-Policy"]).toContain("base-uri 'self'");
    expect(prod["Content-Security-Policy"]).toContain("form-action 'self'");
  });

  it("allow scripts only from North and PayPal, never eval in production", () => {
    const csp = contentSecurityPolicy({ production: true });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).not.toContain("unsafe-eval");
    expect(script).toContain("https://www.sandbox.paypal.com");
    expect(script).not.toMatch(/\*(?!\.paypal)/); // no bare wildcard
    expect(script).not.toMatch(/https:(?!\/\/)/);
    expect(csp).toContain("default-src 'self'");
  });

  it("connections and frames go only to North and PayPal", () => {
    const csp = contentSecurityPolicy({ production: true });
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src"))!;
    expect(connect).not.toMatch(/ \*( |$)/);
    expect(connect).not.toContain("ws:");
    expect(csp.split("; ").find((d) => d.startsWith("frame-src"))).toContain("paypal.com");
  });

  it("HSTS and upgrade-insecure-requests only in production", () => {
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=\d{7,}/);
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
    expect(prod["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
    expect(dev["Content-Security-Policy"]).not.toContain("upgrade-insecure-requests");
  });

  it("turn the camera, microphone and location off", () => {
    expect(prod["Permissions-Policy"]).toMatch(/camera=\(\)/);
    expect(prod["Permissions-Policy"]).toMatch(/microphone=\(\)/);
    expect(prod["Permissions-Policy"]).toMatch(/geolocation=\(\)/);
  });

  it("keep the PayPal popup working", () => {
    expect(prod["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  });
});
