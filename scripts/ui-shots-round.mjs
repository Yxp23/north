// Review screenshots for the Nov 11 round, light and dark at 1440 and 390: the new search bar, results with phones and shoes in ONE grid, a tall phone's
// product page, the size picker on the sneakers, and the sized decision.   node scripts/ui-shots-round.mjs design/screenshots
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";
const out = process.argv[2] ?? "design/screenshots";
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
for (const [w, h] of [[1440, 900], [390, 844]]) for (const mode of ["light", "dark"]) {
  const ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await setAppearance(p, { theme: "tide", mode, reduce: true, solid: null, behind: false, videoSafe: false });
  const name = (n) => `${out}/${n}-${w}${mode === "dark" ? "-dark" : ""}.png`;
  await p.goto(`${BASE}/find`, { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelectorAll("input.fs-input").length === 1);
  await p.waitForTimeout(600);
  await p.screenshot({ path: name("12-search-bar") });
  // One grid with phones AND shoes: two real searches through the Finder, merged into one saved result for this tab (what Back and refresh also use).
  const csrf = (await ctx.cookies()).find((c) => c.name === "north_csrf")?.value;
  const find = async (text) => {
    const r = await ctx.request.post(`${BASE}/api/find`, { headers: { Origin: BASE, "x-north-csrf": csrf }, data: { text } });
    const last = (await r.text()).trim().split("\n").map((l) => JSON.parse(l)).filter((l) => l.type === "result").pop();
    return last.payload.items ?? [];
  };
  const mixed = [...(await find("iphone 15")).slice(0, 3), ...(await find("running shoes")).slice(0, 3)];
  const Q = "phones and shoes";
  await p.goto(`${BASE}/find`, { waitUntil: "load" });
  await p.evaluate(([q, items]) => sessionStorage.setItem(`north-find:${q}`, JSON.stringify({ at: Date.now(), shown: 6, events: [], answer: { route: "finder", payload: { payload: { kind: "found", items, unsure: false } } } })), [Q, mixed]);
  await p.goto(`${BASE}/find?q=${encodeURIComponent(Q)}`, { waitUntil: "load" });
  await p.waitForSelector(".fr-grid .ph-frame img", { timeout: 90000 });
  await p.waitForTimeout(3000);
  await p.evaluate(() => window.scrollTo(0, document.querySelector(".fr-grid").offsetTop - 110));
  await p.waitForTimeout(500);
  await p.screenshot({ path: name("13-results-phones-and-shoes") });
  const phone = await p.locator(".fr-grid > li").first().locator("a[href^='/shop/']").getAttribute("href");
  await p.goto(`${BASE}${phone}`, { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelectorAll(".pg").length === 1, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: name("14-product-tall-phone") });
  await p.goto(`${BASE}/shop/OpovWAw`, { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelectorAll(".sz").length === 1, null, { timeout: 90000 });
  await p.evaluate(() => localStorage.removeItem("north-my-sizes"));
  await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector(".sz").scrollIntoView({ block: "center" }));
  await p.locator(".sz-opt").filter({ hasText: /^9$/ }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: name("15-size-picker") });
  await ctx.close();
}
await browser.close();
