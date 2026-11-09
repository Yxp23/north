// Full-page screenshots of every screen (and the open overlays) at the widths given, for a careful look. Needs a running North in practice mode.
//   node scripts/review-shots.mjs <outDir> <theme> <width,width,...>
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";
const [out = "review", theme = "bloom", widths = "1440,390"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
const PAGES = [["home", "/"], ["find", "/find"], ["saved", "/saved"], ["money", "/money"], ["rules", "/rules"], ["rules-new", "/rules/new"], ["rules-change", "/rules/change/big_buy"], ["assistants", "/assistants"], ["connect", "/connect"], ["check", "/check"], ["welcome1", "/welcome"], ["demo", "/demo"], ["how", "/how-it-works"], ["break", "/try-to-break"], ["assistant-demo", "/assistant-demo"]];
for (const w of widths.split(",").map(Number)) {
  const ctx = await loggedInContext(browser, { width: w, height: w < 700 ? 844 : 900 }, { reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await setAppearance(page, { theme, reduce: true, solid: null, behind: false, videoSafe: false });
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message.slice(0, 200)));
  const shot = (n, full = true) => page.screenshot({ path: `${out}/${theme}-${w}-${n}.png`, fullPage: full });
  for (const [name, path] of PAGES) {
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForSelector("main h1, main h2", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot(name);
  }
  // overlays
  await page.goto(BASE + "/saved", { waitUntil: "load" });
  await page.waitForSelector("main h1");
  await page.getByRole("button", { name: "Menu" }).click(); await page.waitForTimeout(300); await shot("menu", false);
  await page.getByRole("button", { name: "Appearance" }).click(); await page.waitForTimeout(300); await shot("appearance", false);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu" }).click(); await page.getByRole("button", { name: "Help", exact: true }).click(); await page.waitForTimeout(500); await shot("help", false);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Ask North a question/ }).click(); await page.waitForTimeout(500); await shot("ask-dialog", false);
  await page.keyboard.press("Escape");
  await ctx.close();
}
await browser.close();
