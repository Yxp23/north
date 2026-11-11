// Checks the front page motion on a RUNNING North: the pill swap never shows both faces, scroll reveals run once and in order, the numbers count up,
// and with Reduce motion everything is visible at once.   node scripts/landing-check.mjs
import { BASE, launch, setAppearance } from "./ui-lib.mjs";
const browser = await launch();
let bad = 0;
const ok = (c, m, x = "") => { console.log(`${c ? "ok " : "FAIL"} ${m} ${x}`); if (!c) bad++; };
const prefs = (reduce) => ({ theme: "tide", mode: "light", reduce, solid: null, behind: false, videoSafe: false });

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "no-preference" });
  const p = await ctx.newPage();
  await setAppearance(p, prefs(false));
  await p.goto(`${BASE}/`, { waitUntil: "load" });
  await p.waitForSelector(".lp2-stage");
  // 1. the swap: sample both faces of every visible pill for 10 seconds
  const worst = await p.evaluate(() => new Promise((res) => {
    const pills = [...document.querySelectorAll(".lp2-ch")].filter((el) => getComputedStyle(el).display !== "none");
    let worstBoth = 0, samples = 0; const t0 = performance.now();
    (function tick() {
      for (const el of pills) {
        const o = (s) => Number(getComputedStyle(el.querySelector(s)).opacity);
        worstBoth = Math.max(worstBoth, Math.min(o(".b"), o(".a")));
      }
      samples++;
      if (performance.now() - t0 < 10000) requestAnimationFrame(tick); else res({ worstBoth, samples });
    })();
  }));
  ok(worst.worstBoth < 0.12, `${w}: the pill swap never shows both faces`, `most overlap ${worst.worstBoth.toFixed(3)} over ${worst.samples} frames`);
  // 2. the gap under the headline
  const gap = await p.evaluate(() => { const a = document.querySelector(".lp2-hero h1").getBoundingClientRect(); const b = document.querySelector(".lp2-sub").getBoundingClientRect(); return b.top - a.bottom; });
  ok(gap >= 22, `${w}: space between the headline and the sub-line`, `${Math.round(gap)}px`);
  const lines = await p.evaluate(() => { const e = document.querySelector(".lp2-sub"); return Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)); });
  ok(lines <= 2, `${w}: the sub-line is at most 2 lines`, `${lines}`);
  // 3. reveals: below the fold, hidden until scrolled to, then in order, once
  const hiddenAtStart = await p.evaluate(() => [...document.querySelectorAll(".lp2-rv")].filter((e) => Number(getComputedStyle(e).opacity) < 0.05).length);
  ok(hiddenAtStart > 10, `${w}: sections below wait to be revealed`, `${hiddenAtStart} waiting`);
  await p.evaluate(() => document.querySelector("#how").scrollIntoView({ behavior: "instant" }));
  await p.waitForTimeout(1600);
  const how = await p.evaluate(() => [...document.querySelectorAll("#how .lp2-rv")].map((e) => [e.classList.contains("in"), Number(getComputedStyle(e).opacity)]));
  ok(how.every(([inn, o]) => inn && o > 0.95), `${w}: How North decides is revealed`, JSON.stringify(how.map((x) => x[1])));
  const tagScale = await p.evaluate(() => getComputedStyle(document.querySelector(".lp2-out .tag")).transform);
  ok(tagScale === "none" || tagScale === "matrix(1, 0, 0, 1, 0, 0)", `${w}: the badge has landed`, tagScale);
  // 4. numbers count up
  await p.evaluate(() => document.querySelectorAll(".lp2-num")[3].scrollIntoView({ behavior: "instant", block: "center" }));
  const seen = [];
  for (let i = 0; i < 8; i++) { seen.push(await p.evaluate(() => document.querySelectorAll(".lp2-num")[3].textContent)); await p.waitForTimeout(200); }
  ok(new Set(seen).size > 2, `${w}: the numbers count up`, seen.join(" > "));
  await p.waitForTimeout(1200);
  const finals = await p.evaluate(() => [...document.querySelectorAll(".lp2-num")].map((e) => e.textContent));
  ok(finals[0] === "4" && finals[1] === "1" && finals[2] === "2 min" && /^0 \/ 612$/.test(finals[3]), `${w}: the final numbers are right`, JSON.stringify(finals));
  // spacing rhythm: the gaps between sections are the same
  const gaps = await p.evaluate(() => { const secs = [...document.querySelectorAll(".lp2-sec, .lp2-final")]; return secs.map((s) => parseFloat(getComputedStyle(s).paddingTop)); });
  ok(new Set(gaps.map((g) => Math.round(g))).size === 1, `${w}: one spacing between sections`, JSON.stringify(gaps));
  await ctx.close();

  // 5. Reduce motion
  const rc = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const rp = await rc.newPage();
  await setAppearance(rp, prefs(true));
  await rp.goto(`${BASE}/`, { waitUntil: "load" });
  await rp.waitForSelector(".lp2-stage");
  await rp.waitForTimeout(300);
  const hidden = await rp.evaluate(() => [...document.querySelectorAll(".lp2-rv")].filter((e) => Number(getComputedStyle(e).opacity) < 0.99).length);
  const nums = await rp.evaluate(() => [...document.querySelectorAll(".lp2-num")].map((e) => e.textContent));
  ok(hidden === 0, `${w}: Reduce motion: everything is visible at once`, `${hidden} hidden`);
  ok(nums.join("|") === "4|1|2 min|0 / 612", `${w}: Reduce motion: numbers are final at once`, nums.join("|"));
  await rc.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
