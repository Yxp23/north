"use client";
// Makes every same-origin request that changes something carry the CSRF token (copied from the readable north_csrf cookie
// into the x-north-csrf header), so no page has to remember to. It also sends the person to the login page if their
// login ran out. It does nothing to requests to other sites.
const CSRF_COOKIE = "north_csrf";
const CSRF_HEADER = "x-north-csrf";
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function cookie(name: string): string | undefined {
  for (const part of document.cookie.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

type Wrapped = typeof fetch & { __north?: true };
if (typeof window !== "undefined" && !(window.fetch as Wrapped).__north) {
  const original = window.fetch.bind(window);
  const wrapped: Wrapped = async (input, init) => {
    let url: URL | null = null;
    try {
      url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    } catch { /* leave it alone */ }
    const sameSite = url?.origin === window.location.origin;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let nextInit = init;
    if (sameSite && !SAFE.has(method)) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const token = cookie(CSRF_COOKIE);
      if (token) headers.set(CSRF_HEADER, token);
      nextInit = { ...init, headers };
    }
    const res = await original(input, nextInit);
    if (sameSite && res.status === 401 && url?.pathname.startsWith("/api/") && url.pathname !== "/api/auth/login" && window.location.pathname !== "/login") {
      // A full page load on purpose: the login ran out, so start clean.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    return res;
  };
  wrapped.__north = true;
  window.fetch = wrapped;
}

export function CsrfFetch() {
  return null;
}
