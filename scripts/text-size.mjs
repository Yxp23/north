// Finds visible text smaller than 16px (the project's minimum for anything read or tapped; 14px is the absolute floor) on every screen,
// at laptop and phone widths. Needs a running North in practice mode.
import { BASE, launch, loggedInContext } from "./ui-lib.mjs";
const PAGES = ["/", "/find", "/saved", "/money", "/rules", "/rules/new", "/rules/change/big_buy", "/assistants", "/connect", "/check", "/welcome", "/demo", "/how-it-works", "/try-to-break", "/assistant-demo"];
const browser = await launch();
const bad = new Map();
for (const width of [1440, 390]) {
  const ctx = await loggedInContext(browser, { width, height: 900 }, { reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForSelector("main h1, main h2", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    const small = await page.evaluate(() => {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim();
        const el = n.parentElement;
        if (!t || !el || el.closest("script,style,[hidden],.ng-vh,nextjs-portal")) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const px = parseFloat(cs.fontSize);
        if (px < 15.9) out.push({ px: Math.round(px * 10) / 10, text: t.slice(0, 40), cls: String(el.className).slice(0, 50), tag: el.tagName });
      }
      return out;
    });
    for (const s of small) { const k = `${s.px}px ${s.tag}.${s.cls} "${s.text}"`; bad.set(k, [...(bad.get(k) ?? []), `${width}${path}`]); }
  }
}
await browser.close();
for (const [k, where] of bad) console.log(k, "->", where.slice(0, 3).join(", "));
console.log(bad.size ? `${bad.size} kinds of text under 16px.` : "No text under 16px.");
