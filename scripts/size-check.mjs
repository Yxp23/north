// Checks the size flow on a RUNNING North: the picker, Buy off until a size is picked, the remember offer, "Your usual size", the size in the review and
// the decision, My sizes in Money, and the plain note when the store gives no sizes.   node scripts/size-check.mjs [shotsDir]
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";
const out = process.argv[2]; if (out) fs.mkdirSync(out, { recursive: true });
const browser = await launch();
let bad = 0;
const ok = (c, m, x = "") => { console.log(`${c ? "ok " : "FAIL"} ${m} ${x}`); if (!c) bad++; };
for (const [w, h, mode] of [[1440, 900, "light"], [390, 844, "dark"]]) {
  const ctx = await loggedInContext(browser, { width: w, height: h }, { reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await setAppearance(p, { theme: "tide", mode, reduce: true, solid: null, behind: false, videoSafe: false });
  const csrf = async () => (await ctx.cookies()).find((c) => c.name === "north_csrf")?.value;
  await p.goto(`${BASE}/`, { waitUntil: "load" });
  await ctx.request.post(`${BASE}/api/demo/reset`, { headers: { Origin: BASE, "x-north-csrf": await csrf() }, data: {} });
  await p.evaluate(() => { localStorage.removeItem("north-my-sizes"); localStorage.setItem("north-demo-hour", "12"); });
  await p.goto(`${BASE}/shop/OpovWAw`, { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelectorAll(".sz").length === 1, null, { timeout: 60000 });
  ok(await p.getByText("Choose your size").count() >= 1, `${w}: "Choose your size" is shown`);
  ok(await p.locator(".sz-opt").count() === 7, `${w}: the sizes are big buttons`, `${await p.locator(".sz-opt").count()} sizes`);
  const box = await p.locator(".sz-opt > span").first().boundingBox(); ok(box.height >= 48 && box.width >= 48, `${w}: size buttons are at least 48px`, `${Math.round(box.width)}x${Math.round(box.height)}`);
  ok(await p.getByRole("button", { name: "Buy this", exact: true }).isDisabled(), `${w}: Buy this is off until a size is picked`);
  ok(await p.getByText("Pick your size first.").count() >= 1, `${w}: the hint says "Pick your size first."`);
  if (out) await p.screenshot({ path: `${out}/size-picker-${w}-${mode}.png` });
  await p.locator(".sz-opt").filter({ hasText: /^9$/ }).click();
  ok(await p.getByRole("button", { name: "Buy this", exact: true }).isEnabled(), `${w}: Buy this works once a size is picked`);
  ok(await p.getByText("Remember size 9 for next time?").count() === 1, `${w}: offers to remember the size`);
  await p.getByRole("button", { name: "Yes, remember it" }).click();
  ok(await p.getByText(/You can see it in Money, under My sizes/).count() === 1, `${w}: says where it is saved`);
  await p.getByRole("button", { name: "Buy this", exact: true }).click();
  await p.waitForSelector("text=Check before you pay");
  ok(await p.locator(".ng-review").innerText().then((t) => /size 9/.test(t)), `${w}: the review says size 9`);
  await p.getByRole("button", { name: /Pay with your saved PayPal/ }).click();
  await p.waitForFunction(() => { const h = document.querySelector("[role=dialog] h2"); return h && !/Checking|Check before/.test(h.textContent); }, null, { timeout: 40000 });
  await p.waitForTimeout(500);
  ok(/size 9/.test(await p.locator("[role=dialog]").innerText()), `${w}: the Guardian's decision says size 9`, (await p.locator("[role=dialog] h2").first().innerText()));
  if (out) await p.screenshot({ path: `${out}/size-decision-${w}-${mode}.png` });
  await p.keyboard.press("Escape");
  // next visit: your usual size
  await p.goto(`${BASE}/shop/OpovWAw`, { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelectorAll(".sz").length === 1, null, { timeout: 60000 });
  ok(await p.getByText("Your usual size: 9").count() === 1, `${w}: "Your usual size: 9"`);
  ok(await p.getByRole("button", { name: "Buy this", exact: true }).isEnabled(), `${w}: ...and it is preselected`);
  // Money > My sizes
  await p.goto(`${BASE}/money`, { waitUntil: "load" });
  await p.waitForSelector("#sizes-h");
  ok(/Shoe size: 9/.test(await p.locator("#sizes-h").locator("xpath=..").innerText()), `${w}: Money shows My sizes`);
  await p.getByRole("button", { name: /Forget my shoe size/ }).click();
  ok(await p.getByText(/No sizes saved yet/).count() === 1, `${w}: a saved size can be forgotten`);
  // the server never trusts the page: no size at all is refused
  const r = await ctx.request.post(`${BASE}/api/checkout`, { headers: { Origin: BASE, "x-north-csrf": await csrf() }, data: { productId: "OpovWAw", attemptId: `chk-${Date.now()}-abc` } });
  const j = await r.json();
  ok(j.kind === "failed" && /Pick your size first/.test(j.message), `${w}: the server refuses a sized product with no size`, JSON.stringify(j).slice(0, 90));
  await ctx.request.post(`${BASE}/api/demo/reset`, { headers: { Origin: BASE, "x-north-csrf": await csrf() }, data: {} });
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
