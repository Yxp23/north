// Cookie names and the exact Set-Cookie text. The session cookie is HttpOnly (scripts can't read it), SameSite=Lax (not sent
// on cross-site requests except a plain click on a link), Secure in production. The CSRF cookie is readable on purpose:
// the page copies it into a header, and the server compares it with the value it works out from the session itself.
export const SESSION_COOKIE = "north_session";
export const CSRF_COOKIE = "north_csrf";
export const CSRF_HEADER = "x-north-csrf";

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

const attrs = (maxAgeSeconds: number, secure: boolean, httpOnly: boolean) =>
  `Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${secure ? "; Secure" : ""}`;

/** The two Set-Cookie values for a new login. */
export function loginCookies(sessionToken: string, csrfToken: string, maxAgeSeconds: number, secure: boolean): string[] {
  return [`${SESSION_COOKIE}=${sessionToken}; ${attrs(maxAgeSeconds, secure, true)}`, `${CSRF_COOKIE}=${csrfToken}; ${attrs(maxAgeSeconds, secure, false)}`];
}

export function logoutCookies(secure: boolean): string[] {
  return [`${SESSION_COOKIE}=; ${attrs(0, secure, true)}`, `${CSRF_COOKIE}=; ${attrs(0, secure, false)}`];
}
