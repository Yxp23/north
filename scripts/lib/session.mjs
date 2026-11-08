// For scripts that talk to a RUNNING North: log in the way a browser does, then make requests that carry the login cookie,
// the CSRF token and the same-origin header. Used by the end-to-end and smoke scripts.
//   const { fetchAs } = await login(BASE);   await fetchAs("/api/summary");
export async function login(base, email = process.env.DEMO_LOGIN_EMAIL ?? "demo@north.local", password = process.env.DEMO_LOGIN_PASSWORD ?? "north-practice") {
  const origin = new URL(base).origin;
  const res = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  const csrf = cookies.find((c) => c.startsWith("north_csrf="))?.slice("north_csrf=".length);
  const cookie = cookies.join("; ");
  const fetchAs = (path, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    headers.set("Cookie", cookie);
    if (method !== "GET") { headers.set("Origin", origin); headers.set("x-north-csrf", csrf); }
    return fetch(`${base}${path}`, { ...init, headers });
  };
  return { fetchAs, cookie, csrf, origin };
}
