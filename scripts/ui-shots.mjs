// Takes the review screenshots at 1440 and 390 of a RUNNING North (practice mode): Home, Find with a search result and the store comparison,
// a Guardian "wait" decision with "How North decided" open, Saved, Money, first-run step 1.   node scripts/ui-shots.mjs design/screenshots
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";

const out = process.argv[2] ?? "design/screenshots";
fs.mkdirSync(out, { recursive: true });
const browser = await launch();

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await setAppearance(page, { theme: "bloom", reduce: true, solid: null, behind: false, videoSafe: false });
  const shot = (name) => page.screenshot({ path: `${out}/${name}-${w}.png` });
  const ready = (sel = "main h1") => page.waitForSelector(sel, { timeout: 30000 });

  // A clean practice week, so the numbers are the starting ones.
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector("main h1", { timeout: 40000 });
  await page.evaluate(() => fetch("/api/demo/reset", { method: "POST", headers: { "x-north-csrf": document.cookie.split("; ").find((c) => c.startsWith("north_csrf="))?.split("=")[1] ?? "" } }));
  await page.evaluate(() => localStorage.removeItem("north-demo-hour"));

  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await ready();
  await page.waitForTimeout(900);
  await shot("1-home");

  await page.goto(`${BASE}/find`, { waitUntil: "load" });
  await ready();
  await page.getByLabel("What do you need?").fill("warm socks");
  await page.getByRole("button", { name: /^Find it/ }).click();
  await page.waitForSelector("text=What I found", { timeout: 90000 });
  await page.waitForSelector("text=You pay this", { timeout: 30000 }).catch(() => {});
  await page.getByText("You pay this").first().scrollIntoViewIfNeeded().catch(() => page.locator("#results-h").scrollIntoViewIfNeeded());
  await page.evaluate(() => window.scrollBy(0, -140));
  await page.waitForTimeout(900);
  await shot("2-find-result");

  // A gentle wait at noon: sneakers are over the $50 rule.
  await page.evaluate(() => localStorage.setItem("north-demo-hour", "12"));
  await page.goto(`${BASE}/find`, { waitUntil: "load" });
  await ready();
  await page.getByText("Running Series Sneakers").first().click();
  await page.getByRole("button", { name: "Buy this", exact: true }).click();
  await page.getByRole("button", { name: /Pay with your saved PayPal/ }).click();
  await page.waitForFunction(() => { const h = document.querySelector("[role=dialog] h2"); return h && !/Checking|Check before/.test(h.textContent); }, null, { timeout: 40000 });
  await page.getByRole("button", { name: "How North decided" }).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => { const d = document.querySelector(".ng-sheet"); const t = document.querySelector(".gd-how"); if (d && t) d.scrollTop = t.offsetTop - 80; });
  await page.waitForTimeout(200);
  await shot("3-wait-decision");
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.removeItem("north-demo-hour"));

  await page.goto(`${BASE}/saved`, { waitUntil: "load" });
  await ready();
  await page.waitForTimeout(900);
  await shot("4-saved");

  await page.goto(`${BASE}/money`, { waitUntil: "load" });
  await ready();
  await page.waitForTimeout(1200);
  await shot("5-money");

  await page.evaluate(() => localStorage.setItem("north-setup", JSON.stringify({ state: "todo", step: 1 })));
  await page.goto(`${BASE}/welcome`, { waitUntil: "load" });
  await ready();
  await page.waitForTimeout(1500);
  await shot("6-first-run-step-1");
  await ctx.close();
}
await browser.close();
console.log(fs.readdirSync(out).sort().join("\n"));
