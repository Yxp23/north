"use client";
// Notices when the server says "too many" (a 429) on one of North's own requests, so every screen can answer calmly.
// It only OBSERVES: it passes every request and answer through untouched (and never touches the login or CSRF code).
import { markRateLimited } from "@/lib/ui/rate-limit-client";

type Wrapped = typeof fetch & { __northRL?: true };
if (typeof window !== "undefined" && !(window.fetch as Wrapped).__northRL) {
  const inner = window.fetch.bind(window);
  const wrapped: Wrapped = async (input, init) => {
    const res = await inner(input, init);
    if (res.status === 429) {
      try {
        const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
        if (u.origin === window.location.origin && u.pathname.startsWith("/api/") && u.pathname !== "/api/auth/login") markRateLimited();
      } catch {
        /* a odd address: leave it alone */
      }
    }
    return res;
  };
  wrapped.__northRL = true;
  window.fetch = wrapped;
}

export function RateLimitWatch() {
  return null;
}
