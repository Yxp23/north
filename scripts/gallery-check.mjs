// Checks the product gallery and the full-screen viewer on a RUNNING North: arrows, dots, keyboard, open, wheel zoom, drag to move, swipe, Close and Escape, focus back.
//   node scripts/gallery-check.mjs [shotsDir]
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await launch();
let bad = 0;
const ok = (c, m, x = "") => { console.log(`${c ? "ok " : "FAIL"} ${m} ${x}`); if (!c) bad++; };

for (const [w, h, mode] of [[1440, 900, "light"], [390, 844, "dark"]]) {
  const ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce", contextOptions: { hasTouch: w < 700 } });
  const p = await ctx.newPage();
  await setAppearance(p, { theme: "bloom", mode, reduce: true, solid: null, behind: false, videoSafe: false });
  await p.goto(`${BASE}/find?q=stainless+steel+water+bottle`, { waitUntil: "load" });
  await p.waitForSelector(".fr-grid", { timeout: 90000 });
  // Find a product with several photos.
  const hrefs = await p.locator(".fr-grid a[href^='/shop/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  let found = false, best = "", bestN = 0;
  for (const href of hrefs) {
    await p.goto(BASE + href, { waitUntil: "load" });
    await p.waitForSelector(".pg", { timeout: 60000 });
    await p.waitForFunction(() => document.querySelectorAll(".pg").length === 1); // streaming can briefly hold two copies
    const n = await p.locator(".pg-dot").count();
    if (n > bestN) { best = href; bestN = n; }
    if (n >= 3) break;
  }
  if (bestN > 1) { found = true; if (!(await p.locator(".pg-dot").count() >= bestN)) { await p.goto(BASE + best, { waitUntil: "load" }); await p.waitForSelector(".pg"); } }
  ok(found, `${w}: a product with several photos`);
  if (!found) { await ctx.close(); continue; }
  const dots = await p.locator(".pg-dot").count();
  const idx = () => p.locator(".pg-dot[aria-current='true']").evaluate((d) => [...d.parentElement.children].indexOf(d));
  ok((await idx()) === 0, `${w}: starts on photo 1 of ${dots}`);
  await p.getByRole("button", { name: "Next photo" }).first().click();
  await p.waitForTimeout(700);
  ok((await idx()) === 1, `${w}: Next arrow moves to photo 2`);
  const lastDot = dots - 1;
  await p.locator(".pg-dot").nth(lastDot).click(); await p.waitForTimeout(700);
  ok((await idx()) === lastDot, `${w}: a dot jumps to photo ${dots}`);
  if (lastDot > 1) { await p.locator(".pg-dot").nth(lastDot - 1).click(); await p.waitForTimeout(700); }
  await p.locator(".pg-track").focus(); const k0 = await idx(); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(700);
  ok((await idx()) === k0 - 1, `${w}: keyboard arrow works`);
  await p.locator(".pg-dot").nth(1).click(); await p.waitForTimeout(700);
  if (out) await p.screenshot({ path: `${out}/gallery-${w}-${mode}.png` });

  // Open the viewer.
  const opener = p.locator(".pg-slide .pg-open").nth(1);
  await opener.scrollIntoViewIfNeeded(); await opener.click();
  await p.waitForSelector(".pv", { timeout: 5000 });
  ok(await p.locator(".pv").getAttribute("aria-modal") === "true", `${w}: viewer is a modal dialog`);
  ok(await p.evaluate(() => document.activeElement?.classList.contains("pv-close")), `${w}: focus is on Close`);
  ok((await p.locator(".pv-count").innerText()).startsWith("Photo 2 of"), `${w}: viewer opens on the tapped photo`);
  await p.waitForSelector(".pv-stage img[style*='width']", { timeout: 15000 });
  const scale = async () => p.locator(".pv-stage img").evaluate((i) => { const m = /scale\(([\d.]+)\)/.exec(i.style.transform); return m ? Number(m[1]) : 1; });
  const tx = async () => p.locator(".pv-stage img").evaluate((i) => { const m = /translate\((-?[\d.]+)px/.exec(i.style.transform); return m ? Number(m[1]) : 0; });
  ok((await scale()) === 1, `${w}: starts fitted`);
  const box = await p.locator(".pv-stage").boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8; i++) await p.mouse.wheel(0, -200);
  await p.waitForTimeout(300);
  const s1 = await scale();
  ok(s1 > 1.5, `${w}: wheel zooms in`, `scale=${s1.toFixed(2)}`);
  const x0 = await tx();
  await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(300);
  ok((await tx()) > x0 + 20, `${w}: drag moves the zoomed photo`, `x ${x0}->${await tx()}`);
  if (out) await p.screenshot({ path: `${out}/viewer-zoomed-${w}-${mode}.png` });
  await p.getByRole("button", { name: "Fit" }).click();
  ok((await scale()) === 1, `${w}: Fit goes back`);
  await p.getByRole("button", { name: "Zoom in" }).click(); await p.waitForTimeout(250);
  ok((await scale()) > 1.2, `${w}: Zoom in button`);
  await p.keyboard.press("0");
  // Swipe to the next photo.
  const before = await p.locator(".pv-count").innerText();
  await p.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(300);
  ok((await p.locator(".pv-count").innerText()) !== before, `${w}: swipe changes photo`, `${before} -> ${await p.locator(".pv-count").innerText()}`);
  if (out) await p.screenshot({ path: `${out}/viewer-${w}-${mode}.png` });
  await p.keyboard.press("Escape");
  await p.waitForSelector(".pv", { state: "detached" });
  ok(await p.evaluate(() => document.activeElement?.classList.contains("pg-open")), `${w}: Escape closes and focus goes back to the photo`);
  ok(await p.evaluate(() => document.documentElement.style.overflow === ""), `${w}: page scrolls again`);
  await p.locator(".pg-slide .pg-open").nth(1).click();
  await p.getByRole("button", { name: "Close" }).click();
  await p.waitForSelector(".pv", { state: "detached" });
  ok(true, `${w}: Close button closes`);
  await ctx.close();
}

// Video-safe: live-store photos are hidden in the viewer too.
{
  const ctx = await loggedInContext(browser, { width: 1440, height: 900 }, { reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await setAppearance(p, { theme: "bloom", mode: "light", reduce: true, solid: null, behind: false, videoSafe: true });
  await p.goto(`${BASE}/find?q=stainless+steel+water+bottle`, { waitUntil: "load" });
  await p.waitForSelector(".fr-grid", { timeout: 90000 });
  await p.locator(".fr-grid a[href^='/shop/']").first().click();
  await p.waitForSelector(".pg-open");
  await p.locator(".pg-open").first().click();
  await p.waitForSelector(".pv");
  ok(await p.locator(".pv .pv-hidden").count() === 1 && await p.locator(".pv-stage img").count() === 0, "video-safe: the viewer hides a live-store photo");
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
