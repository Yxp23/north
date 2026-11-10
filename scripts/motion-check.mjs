// Checks the motion on a RUNNING North: dialog open/close springs, phone drag-to-dismiss, and that Reduce motion makes everything instant.
//   node scripts/motion-check.mjs
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";

const browser = await launch();
let bad = 0;
const ok = (c, m, x = "") => { console.log(`${c ? "ok " : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const prefs = (reduce) => ({ theme: "bloom", mode: "light", reduce, solid: null, behind: false, videoSafe: false });
const sheets = (p) => p.evaluate(() => [...document.querySelectorAll(".ng-sheet")].map((s) => ({ ghost: s.getAttribute("aria-hidden") === "true", anims: s.getAnimations().length })));
const openHelp = async (p) => { await p.getByRole("button", { name: "Help" }).first().click(); await p.waitForSelector(".ng-sheet[role=dialog]"); };

for (const [w, h] of [[1440, 900], [390, 844]]) {
  // ---- motion ON
  let ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "no-preference" });
  let p = await ctx.newPage();
  await setAppearance(p, prefs(false));
  await p.goto(`${BASE}/`, { waitUntil: "load" }); await p.waitForSelector("main h1"); await p.waitForTimeout(800);
  await openHelp(p);
  const open = await sheets(p);
  ok(open.length === 1 && open[0].anims >= 1, `${w}: opens with a spring animation`, JSON.stringify(open));
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: "Close" }).first().click();
  await p.waitForTimeout(40);
  const closing = await sheets(p);
  ok(closing.length === 1 && closing[0].ghost && closing[0].anims >= 1, `${w}: closing plays before it goes`, JSON.stringify(closing));
  ok(await p.evaluate(() => !document.querySelector(".ng-content")?.hasAttribute("inert")), `${w}: the page is usable again at once`);
  await p.waitForTimeout(450);
  ok((await sheets(p)).length === 0, `${w}: the copy is removed afterwards`);

  if (w < 700) {
    // Drag down far: closes.
    await openHelp(p); await p.waitForTimeout(700);
    const head = await p.locator(".ng-sheet-head").boundingBox();
    await p.mouse.move(head.x + 120, head.y + 20); await p.mouse.down();
    await p.mouse.move(head.x + 120, head.y + 140, { steps: 8 }); 
    const dragged = await p.locator(".ng-sheet[role=dialog]").evaluate((s) => s.style.transform);
    ok(/translateY\(\d/.test(dragged), `${w}: the sheet follows the finger`, dragged);
    await p.mouse.move(head.x + 120, head.y + 260, { steps: 6 }); await p.mouse.up();
    await p.waitForTimeout(60);
    ok((await sheets(p)).every((s) => s.ghost), `${w}: a long drag closes it`);
    await p.waitForTimeout(450);
    ok((await sheets(p)).length === 0, `${w}: and it is gone`);
    // Short drag: springs back.
    await openHelp(p); await p.waitForTimeout(700);
    const head2 = await p.locator(".ng-sheet-head").boundingBox();
    await p.mouse.move(head2.x + 120, head2.y + 20); await p.mouse.down();
    await p.mouse.move(head2.x + 120, head2.y + 50, { steps: 8 }); await p.waitForTimeout(400); await p.mouse.up();
    await p.waitForTimeout(700);
    const back = await p.locator(".ng-sheet[role=dialog]").evaluate((s) => s.style.transform);
    ok((await sheets(p)).length === 1 && back === "", `${w}: a short drag springs back and stays open`, JSON.stringify(back));
    await p.keyboard.press("Escape"); await p.waitForTimeout(500);
  }
  // ---- the tab pill: one element, springs between tabs on a route change, and can be dragged
  await p.goto(`${BASE}/find`, { waitUntil: "load" }); await p.waitForSelector("main h1"); await p.waitForTimeout(800);
  ok(await p.locator(".ng-nav-selector").count() === 1, `${w}: one selected-pill element`);
  await p.getByRole("link", { name: "Saved", exact: true }).first().click();
  await p.waitForURL(/\/saved/); await p.waitForTimeout(30);
  ok(await p.locator(".ng-nav-selector").evaluate((e) => e.getAnimations().length >= 1), `${w}: the pill springs to the new tab`);
  const page = await p.evaluate(() => document.getElementById("main").getAnimations().map((a) => a.effect.getTiming().duration));
  ok(page.length >= 1 && page.every((d) => d <= 250), `${w}: page change is a short fade (<= 250ms)`, JSON.stringify(page));
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => document.getAnimations().every((a) => !String(a.animationName ?? "").includes("shine"))), `${w}: no sweep animation on click`);
  const pill = await p.locator(".ng-nav-selector").boundingBox();
  const nav = await p.locator(".ng-nav").boundingBox();
  const cy = pill.y + pill.height / 2;
  await p.mouse.move(pill.x + pill.width / 2, cy); await p.mouse.down();
  await p.mouse.move(pill.x + pill.width / 2 + pill.width * 0.6, cy, { steps: 6 });
  ok(await p.locator(".ng-nav").evaluate((n) => n.classList.contains("ng-nav-drag")), `${w}: dragging tints the pill`);
  const mid = await p.locator(".ng-nav-selector").boundingBox();
  ok(mid.x > pill.x + 10 && mid.x + mid.width <= nav.x + nav.width + 2, `${w}: the pill follows the pointer, inside the capsule`, `${Math.round(pill.x)} -> ${Math.round(mid.x)}`);
  await p.mouse.move(pill.x + pill.width / 2 + pill.width * 1.1, cy, { steps: 6 }); await p.mouse.up();
  await p.waitForURL(/\/money/, { timeout: 15000 });
  await p.waitForTimeout(700);
  ok(await p.getByRole("link", { name: "Money", exact: true }).first().getAttribute("aria-current") === "page", `${w}: letting go snaps to the nearest tab and goes there (aria-current follows)`);
  const end = await p.locator(".ng-nav-selector").boundingBox();
  const moneyLink = await p.getByRole("link", { name: "Money", exact: true }).first().boundingBox();
  ok(Math.abs((end.x + end.width / 2) - (moneyLink.x + moneyLink.width / 2)) < 6, `${w}: the pill rests under Money`);
  await ctx.close();

  // ---- Reduce motion: everything instant
  ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce" });
  p = await ctx.newPage();
  await setAppearance(p, prefs(true));
  await p.goto(`${BASE}/`, { waitUntil: "load" }); await p.waitForSelector("main h1"); await p.waitForTimeout(600);
  await openHelp(p);
  ok((await sheets(p))[0].anims === 0, `${w}: Reduce motion: opens with no animation`);
  await p.getByRole("button", { name: "Close" }).first().click();
  ok((await sheets(p)).length === 0, `${w}: Reduce motion: closes at once`);
  await p.getByRole("link", { name: "Saved", exact: true }).first().click();
  await p.waitForURL(/\/saved/); await p.waitForTimeout(30);
  ok(await p.evaluate(() => document.getAnimations().length === 0), `${w}: Reduce motion: no animation anywhere on a page change`);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
