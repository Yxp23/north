// The ONLY paths that do not need a login cookie, and why. The proxy and the structure test both read this list.
// "/" is the front page for someone who is not signed in (it shows Home to someone who is); "/how-it-works" is plain public information.
export const PUBLIC_PAGES = ["/", "/how-it-works", "/login"] as const;

/** path -> how it is protected instead. A route listed here must say so in its code (the structure test checks the marker). */
export const PUBLIC_API: Record<string, { how: string; marker: string }> = {
  "/api/auth/login": { how: "checks the password with Supabase Auth, rate limited, same-origin only", marker: "signIn(" },
  "/api/mcp": { how: "an assistant's own revocable key, checked on every request", marker: "mcpHandler(" },
  "/api/paypal/webhook": { how: "PayPal's signature, checked by PayPal", marker: "verifyWebhookSignature(" },
  "/api/watch/run": { how: "POST needs a login; GET needs the cron secret", marker: "isCronAuthorized(" },
  "/api/cron/daily": { how: "needs the cron secret (Vercel cron sends it)", marker: "isCronAuthorized(" },
  "/api/cron/demo-reset": { how: "needs the cron secret (Vercel cron sends it); the judges' demo only", marker: "isCronAuthorized(" },
};

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PAGES as readonly string[]).includes(pathname) || Object.prototype.hasOwnProperty.call(PUBLIC_API, pathname);
}
