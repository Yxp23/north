// Security headers for every response (set by src/proxy.ts).
//
// The Content-Security-Policy keeps scripts, frames, forms and connections on North and PayPal. Honest limit: pages are
// prerendered, and a prerendered page can't carry a per-request nonce, so script-src must allow 'unsafe-inline' for the
// inline scripts Next.js itself writes. What still protects us from script injection: React escapes all text, a test bans
// dangerouslySetInnerHTML / innerHTML, and untrusted text is only ever shown as plain text. See docs/security.md.
const PAYPAL_HOSTS = "https://www.sandbox.paypal.com https://www.paypal.com https://*.paypal.com https://*.paypalobjects.com";

export function contentSecurityPolicy(opts: { production: boolean }): string {
  const dev = !opts.production;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${PAYPAL_HOSTS}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:", // product pictures come from many stores' https addresses
    "font-src 'self'",
    `connect-src 'self' ${PAYPAL_HOSTS}${dev ? " ws: wss:" : ""}`,
    `frame-src ${PAYPAL_HOSTS}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    ...(opts.production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function securityHeaders(opts: { production: boolean }): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(opts),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), bluetooth=(), payment=(self)",
    // The PayPal popup needs to talk back to the page that opened it.
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "X-DNS-Prefetch-Control": "off",
    ...(opts.production ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
  };
}
