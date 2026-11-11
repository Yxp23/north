// axe on the front page ("/", logged out): all five themes, light and dark, normal and solid surfaces, at laptop and phone width. Run with Reduce
// motion on, so the stage is the still composition (everything visible and readable). Needs a running North.
//   node scripts/axe-landing.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { BASE, launch, setAppearance } from "./ui-lib.mjs";
const require = createRequire(import.meta.url);
const axe = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const browser = await launch();
let bad = 0, n = 0;
for (const theme of ["tide", "dune", "grove", "opal", "bloom"]) for (const mode of ["light", "dark"]) for (const solid of [false, true]) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await setAppearance(p, { theme, mode, reduce: true, solid, behind: false, videoSafe: false });
  await p.goto(`${BASE}/`, { waitUntil: "load" });
  await p.waitForSelector(".lp2-stage");
  await p.waitForTimeout(300);
  await p.evaluate(axe);
  const r = await p.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
  n++;
  const hs = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (r.violations.length || hs) { bad++; console.log(`FAIL ${theme} ${mode}${solid ? "+solid" : ""} ${w}`, hs ? "HORIZONTAL SCROLL" : "", r.violations.map((v) => `${v.id}: ${v.nodes[0].target}`).join(" | ")); }
  await ctx.close();
}
console.log(`${n} scans, ${bad} with problems.`);
await browser.close();
process.exit(bad ? 1 : 0);
