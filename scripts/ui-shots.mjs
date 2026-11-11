// Takes the review screenshots (light and dark) at 1440 and 390 of a RUNNING North (practice mode): Home, Find with a search result and the store comparison,
// a Guardian "wait" decision with "How North decided" open, Saved, Money, first-run step 1.   node scripts/ui-shots.mjs design/screenshots
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";

const out = process.argv[2] ?? "design/screenshots";
fs.mkdirSync(out, { recursive: true });
const browser = await launch();

for (const [w, h, mode] of [[1440, 900, "light"], [390, 844, "light"], [1440, 900, "dark"], [390, 844, "dark"]]) {
  const ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await setAppearance(page, { theme: "bloom", mode, reduce: true, solid: null, behind: false, videoSafe: false });
  const shot = (name) => page.screenshot({ path: `${out}/${name}-${w}${mode === "dark" ? "-dark" : ""}.png` });
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
  await page.waitForFunction(() => document.querySelectorAll("input.fs-input").length === 1); // streaming can briefly hold two copies
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
  await page.waitForSelector("text=Buy this", { timeout: 60000 });
  for (let i = 0; i < 4; i++) { // click again if the page was not interactive yet
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Buy this", exact: true }).click();
    if (await page.waitForSelector("text=Check before you pay", { timeout: 8000 }).then(() => true).catch(() => false)) break;
  }
  await page.getByRole("button", { name: /Pay with your saved PayPal/ }).click();
  await page.waitForFunction(() => { const h = document.querySelector("[role=dialog] h2"); return h && !/Checking|Check before/.test(h.textContent); }, null, { timeout: 40000 });
  await page.waitForTimeout(900);
  await shot("3-wait-decision"); // how it opens: at the top, "How North decided" collapsed
  await page.getByRole("button", { name: "How North decided" }).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => { const d = document.querySelector(".ng-sheet"); const t = document.querySelector(".gd-how"); if (d && t) d.scrollTop = t.offsetTop - 120; });
  await page.waitForTimeout(200);
  await shot("3-wait-decision-expanded");
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
