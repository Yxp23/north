// End-to-end: log in, log out from the Menu, and check that "/" shows the FRONT PAGE (not Home, not a blank page), also after a refresh,
// and that a private page sends you to the login. Run it against a PRODUCTION build (npm run build; next start), where the cookies are Secure:
//   BASE_URL=http://localhost:3300 node scripts/e2e-logout.mjs
// Logs in with the practice login (DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD, or the documented judge defaults).
import { BASE, launch } from "./ui-lib.mjs";

const email = process.env.DEMO_LOGIN_EMAIL ?? "judge@north-demo.app";
const password = process.env.DEMO_LOGIN_PASSWORD ?? "North-Judges-2026!";
let bad = 0;
const ok = (c, m, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m} ${x}`); if (!c) bad++; };
const heroText = async (p) => (await p.locator("h1").first().innerText().catch(() => "")).replace(/\s+/g, " ");
const isLanding = (t) => /spend your money/i.test(t);

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
// A first-time visitor: the front page's "Try the demo" signs in through the normal login and opens Home.
await p.goto(`${BASE}/`, { waitUntil: "load" });
await p.waitForSelector(".lp2-stage");
ok(isLanding(await heroText(p)), "a visitor sees the front page", await heroText(p));
ok((await p.getByRole("button", { name: /Try the demo/ }).count()) >= 2, "'Try the demo' is offered (hero and the end of the page)");
await p.getByRole("button", { name: /Try the demo/ }).first().click();
await p.waitForFunction(() => /need today/i.test(document.querySelector("h1")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => undefined);
ok(/need today/i.test(await heroText(p)), "'Try the demo' opens Home", await heroText(p));
await p.evaluate(() => fetch("/api/auth/logout", { method: "POST", headers: { "x-north-csrf": document.cookie.split("; ").find((c) => c.startsWith("north_csrf="))?.split("=")[1] ?? "" } }));
await ctx.clearCookies();
const res = await ctx.request.post(`${BASE}/api/auth/login`, { headers: { Origin: new URL(BASE).origin }, data: { email, password } });
ok(res.ok(), "log in", `status=${res.status()}`);

await p.goto(`${BASE}/`, { waitUntil: "load" });
await p.waitForSelector("main h1, h1");
ok(/need today/i.test(await heroText(p)), "logged in: '/' is Home", await heroText(p));

await p.getByRole("button", { name: "Menu" }).click();
await p.getByRole("button", { name: /Log out/ }).click();
// The page is already at "/" (Home), so wait for the front page itself to replace it.
await p.waitForFunction(() => /spend your money/i.test(document.querySelector("h1")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => undefined);
ok(isLanding(await heroText(p)), "after Log out you are on the front page", await heroText(p));
const names = (await ctx.cookies()).map((c) => c.name);
ok(!names.includes("north_session"), "the session cookie is gone", JSON.stringify(names));

await p.reload({ waitUntil: "load" });
await p.waitForSelector("h1");
ok(isLanding(await heroText(p)), "after a refresh '/' is still the front page", await heroText(p));
await p.goto(`${BASE}/`, { waitUntil: "load" });
await p.waitForSelector("h1");
ok(isLanding(await heroText(p)), "visiting '/' again shows the front page", await heroText(p));
await p.goto(`${BASE}/money`, { waitUntil: "load" });
ok(new URL(p.url()).pathname === "/login", "a private page sends you to the login", p.url());
await p.goBack();
await p.goto(`${BASE}/`, { waitUntil: "load" });
ok(isLanding(await heroText(p)), "Back after that still shows the front page");
await browser.close();
process.exit(bad ? 1 : 0);
