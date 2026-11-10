// Checks the results page on a RUNNING North: the search is in the address, Back/refresh/tab switch show the same results without asking the
// stores again, "Show more" works, a product has "Back to results" that returns to the same place.   node scripts/find-check.mjs [shotsDir]
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await launch();
let bad = 0;
const ok = (c, m, x = "") => { console.log(`${c ? "ok " : "FAIL"} ${m} ${x}`); if (!c) bad++; };

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await setAppearance(p, { theme: "bloom", mode: "light", reduce: true, solid: null, behind: false, videoSafe: false });
  let asks = 0;
  p.on("request", (r) => { if (r.url().includes("/api/ask") && r.method() === "POST") asks++; });
  await p.goto(`${BASE}/find`, { waitUntil: "load" });
  await p.waitForSelector("main h1");
  await p.getByLabel("What do you need?").fill("stainless steel water bottle");
  await p.getByRole("button", { name: /^Find it/ }).click();
  await p.waitForURL(/\/find\?q=stainless\+steel\+water\+bottle/, { timeout: 15000 });
  await p.waitForSelector("#results-h", { timeout: 90000 });
  ok(asks === 1, `${w}: one search asked`, `asks=${asks}`);
  const cards = () => p.locator(".fr-grid > li").count();
  const n1 = await cards();
  ok(n1 > 0 && n1 <= 6, `${w}: at most 6 first`, `n=${n1}`);
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector(".fr-grid")).gridTemplateColumns.split(" ").length);
  ok(cols === (w > 760 ? 2 : 1), `${w}: columns`, `cols=${cols}`);
  const more = p.getByRole("button", { name: /^Show \d+ more/ });
  if (await more.count()) { await more.click(); ok((await cards()) > n1, `${w}: Show more adds results`); }
  if (out) await p.screenshot({ path: `${out}/results-${w}.png` });
  // Open a product from near the bottom, then come back.
  await p.locator(".fr-grid > li").last().scrollIntoViewIfNeeded();
  const y = await p.evaluate(() => window.scrollY);
  const total = await cards();
  await p.locator(".fr-grid > li").last().getByRole("link", { name: "Look at this one" }).click();
  await p.waitForURL(/\/shop\//, { timeout: 30000 });
  await p.getByRole("link", { name: "Back to results" }).waitFor({ timeout: 30000 });
  if (out) await p.screenshot({ path: `${out}/product-${w}.png` });
  await p.getByRole("link", { name: "Back to results" }).click();
  await p.waitForSelector(".fr-grid");
  await p.waitForTimeout(800);
  const y2 = await p.evaluate(() => window.scrollY);
  ok(Math.abs(y2 - y) < 40, `${w}: same scroll position`, `before=${y} after=${y2}`);
  ok((await cards()) === total, `${w}: same results (and Show more kept)`);
  ok(asks === 1, `${w}: still one search after Back`, `asks=${asks}`);
  await p.reload({ waitUntil: "load" });
  await p.waitForSelector(".fr-grid");
  ok((await cards()) === total && asks === 1, `${w}: refresh shows the same results, no new search`, `asks=${asks}`);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
