// Screenshots of the front page ("/", logged out) at 1440 and 390, light and dark, above the fold and full page, plus the Reduce motion still.
//   node scripts/ui-shots-landing.mjs design/screenshots
import fs from "node:fs";
import { BASE, launch, setAppearance } from "./ui-lib.mjs";
const out = process.argv[2] ?? "design/screenshots";
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
for (const [w, h] of [[1440, 900], [390, 844]]) for (const mode of ["light", "dark"]) for (const still of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: still ? "reduce" : "no-preference" });
  const p = await ctx.newPage();
  await setAppearance(p, { theme: "bloom", mode, reduce: still, solid: null, behind: false, videoSafe: false });
  await p.goto(`${BASE}/`, { waitUntil: "load" });
  await p.waitForSelector(".lp2-stage");
  await p.waitForTimeout(still ? 500 : (w > 700 ? 6800 : 4300)); // moving: a moment when a pill of each kind is on the stage
  const base = `${out}/11-landing${still ? "-still" : ""}-${w}${mode === "dark" ? "-dark" : ""}`;
  await p.screenshot({ path: `${base}.png` });
  if (!still) await p.screenshot({ path: `${base}-full.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
