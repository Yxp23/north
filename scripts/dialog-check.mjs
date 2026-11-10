// Runs the REAL checking -> answer transition in the buy dialog and measures it: the first button must be fully visible and clear of the head, the
// dialog must open at the top, and its scroll area must sit inside the rounded frame. Needs a running North (practice mode).
//   node scripts/dialog-check.mjs [outDir]
import fs from "node:fs";
import { BASE, launch, loggedInContext, setAppearance } from "./ui-lib.mjs";
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
const b = await launch();
const csrf = (p) => p.evaluate(() => document.cookie.split("; ").find((c) => c.startsWith("north_csrf="))?.split("=")[1] ?? "");
let bad = 0;
for (const mode of ["light", "dark"]) for (const w of [1440, 390]) {
  const ctx = await loggedInContext(b, { width: w, height: w < 700 ? 844 : 900 }, { reducedMotion: "reduce" });
  const p = await ctx.newPage(); await setAppearance(p, { theme: "bloom", mode, reduce: true, solid: null, behind: false, videoSafe: false });
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 }); await p.waitForSelector("main h1", { timeout: 60000 });
  const t = await csrf(p); await p.evaluate((t) => fetch("/api/demo/reset", { method: "POST", headers: { "x-north-csrf": t } }), t);
  await p.evaluate(() => localStorage.setItem("north-demo-hour", "12"));
  for (const [label, name] of [["approved", "Mild Shampoo"], ["wait", "White T-Shirt"], ["stopped", "Over-Ear Headphones"]]) {
    await p.goto(BASE + "/find", { waitUntil: "domcontentloaded" }); await p.waitForSelector("main h1");
    await p.getByText(name).first().click(); await p.waitForSelector("text=Buy this", { timeout: 60000 });
    for (let i = 0; i < 4; i++) { await p.waitForTimeout(700); await p.getByRole("button", { name: "Buy this", exact: true }).click(); if (await p.waitForSelector("text=Check before you pay", { timeout: 8000 }).then(() => true).catch(() => false)) break; }
    await p.getByRole("button", { name: /Pay with your saved PayPal/ }).click();
    await p.waitForFunction(() => { const h = document.querySelector("[role=dialog] .ng-sheet-head h2"); return !!h; }, null, { timeout: 60000 });
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const d = document.querySelector(".ng-sheet"), head = d.querySelector(".ng-sheet-head"), sc = d.querySelector(".ng-sheet-scroll");
      const dr = d.getBoundingClientRect(), hr = head.getBoundingClientRect(), sr = sc.getBoundingClientRect();
      const btn = [...sc.querySelectorAll(".n-btn")].find((x) => x.offsetParent);
      const br = btn?.getBoundingClientRect();
      return {
        scrollTop: sc.scrollTop, headBottom: Math.round(hr.bottom), scrollTop_y: Math.round(sr.top),
        firstBtnTop: br ? Math.round(br.top) : null, firstBtnBottom: br ? Math.round(br.bottom) : null,
        firstBtnClear: !br || (br.top >= hr.bottom - 1 && br.bottom <= Math.min(sr.bottom, innerHeight) + 1),
        scrollbarInside: sr.right <= dr.right && sr.bottom <= dr.bottom, frameClips: getComputedStyle(d).overflow === "hidden",
        scrollable: sc.scrollHeight > sc.clientHeight + 1,
      };
    });
    const ok = m.scrollTop === 0 && m.firstBtnClear && m.scrollbarInside && m.frameClips;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${mode} ${w} ${label.padEnd(9)} ${JSON.stringify(m)}`);
    if (out) await p.screenshot({ path: `${out}/dialog-${label}-${w}-${mode}.png` });
    await p.keyboard.press("Escape");
  }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
