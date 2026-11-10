// Review screenshots for the results page, product gallery, full-screen viewer and decision dialogs, light and dark, 1440 and 390.
//   node scripts/ui-shots-new.mjs design/screenshots
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";
const out = process.argv[2] ?? "design/screenshots";
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
for (const [w, h, mode] of [[1440, 900, "light"], [390, 844, "light"], [1440, 900, "dark"], [390, 844, "dark"]]) {
  const ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await setAppearance(p, { theme: "bloom", mode, reduce: true, solid: null, behind: false, videoSafe: false });
  const name = (n) => `${out}/${n}-${w}${mode === "dark" ? "-dark" : ""}.png`;
  await p.goto(`${BASE}/find?q=stainless+steel+water+bottle`, { waitUntil: "load" });
  await p.waitForSelector(".fr-grid .ph-frame img", { timeout: 90000 }); await p.waitForTimeout(2500);
  await p.evaluate(() => window.scrollTo(0, document.querySelector("#results-h").offsetTop - 120)); await p.waitForTimeout(500);
  await p.screenshot({ path: name("8-results") });
  const hrefs = await p.locator(".fr-grid a[href^='/shop/']").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  let best = hrefs[0], bestN = 0;
  for (const href of hrefs) { await p.goto(BASE + href, { waitUntil: "load" }); await p.waitForSelector(".pg"); await p.waitForFunction(() => document.querySelectorAll(".pg").length === 1); const n = await p.locator(".pg-dot").count(); if (n > bestN) { best = href; bestN = n; } if (n >= 5) break; }
  await p.goto(BASE + best, { waitUntil: "load" }); await p.waitForSelector(".pg"); await p.waitForFunction(() => document.querySelectorAll(".pg").length === 1); await p.waitForTimeout(1200);
  await p.screenshot({ path: name("9-product-gallery") });
  await p.locator(".pg-open").first().click(); await p.waitForSelector(".pv"); await p.waitForTimeout(800);
  await p.screenshot({ path: name("10-photo-viewer") });
  await ctx.close();
}
await browser.close();
