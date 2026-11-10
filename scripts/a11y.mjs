// Runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on every screen, in all five themes, in normal and solid-surface modes, and on the
// open dialogs and panels. Also light and dark. Needs a running North (BASE_URL, default http://localhost:3200) in practice mode.
//   node scripts/a11y.mjs            everything
//   node scripts/a11y.mjs quick      only Bloom and Opal, to check a fix
//   node scripts/a11y.mjs all dark   one mode only (light or dark)
import fs from "node:fs";
import { createRequire } from "node:module";
import { BASE, launch, loggedInContext } from "./ui-lib.mjs";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const THEMES = process.argv[2] === "quick" ? ["bloom", "opal"] : ["tide", "dune", "grove", "opal", "bloom"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = ["/", "/find", "/saved", "/money", "/rules", "/rules/new", "/rules/change/big_buy", "/assistants", "/connect", "/check", "/welcome", "/demo", "/activity", "/how-it-works", "/try-to-break", "/assistant-demo"];


// The dev server sometimes stalls on a first compile: try a page up to three times before giving up.
async function go(page, url) {
  for (let i = 1; ; i++) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForTimeout(3000);
    }
  }
}

async function scan(page, label, found) {
  await page.evaluate(axeSource);
  const r = await page.evaluate((tags) => axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"] }), TAGS);
  for (const v of r.violations) found.push({ label, kind: "violation", id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(" "), why: (n.any[0]?.message ?? n.failureSummary ?? "").slice(0, 200) })), count: v.nodes.length });
  for (const v of r.incomplete.filter((x) => x.id === "color-contrast")) found.push({ label, kind: "incomplete", id: v.id, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(" "), why: (n.any[0]?.message ?? "").slice(0, 160) })), count: v.nodes.length });
}

const browser = await launch();
const found = [];
const ctx = await loggedInContext(browser, { width: 1440, height: 900 }, { reducedMotion: "reduce" });
const page = await ctx.newPage();
await go(page, `${BASE}/find`);
const productHref = await page.locator('a[href^="/shop/"]').first().getAttribute("href");
const pages = [...PAGES, productHref];
let runs = 0;

const MODES = process.argv[3] ? [process.argv[3]] : ["light", "dark"];
for (const mode of MODES) for (const theme of THEMES) {
  for (const solid of [false, true]) {
    const setPrefs = (behind) => page.evaluate(([t, s, m, b]) => localStorage.setItem("north-appearance", JSON.stringify({ theme: t, mode: m, reduce: true, solid: s, behind: b })), [theme, solid, mode, behind]);
    await setPrefs(false);
    for (const path of pages) {
      await go(page, BASE + path);
      await page.waitForSelector("main h1, main h2", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(500);
      await scan(page, `${theme}-${mode}${solid ? "+solid" : ""} ${path}`, found);
      runs++;
    }
    // Overlays: Help, Ask North, Appearance, Behind the scenes (with real steps), the review dialog and a decision.
    const tag = `${theme}-${mode}${solid ? "+solid" : ""}`;
    await go(page, BASE + "/saved");
    await page.waitForSelector("main h1", { timeout: 20000 });
    await page.getByRole("button", { name: "Menu" }).click();
    await scan(page, `${tag} panel:Menu`, found);
    await page.getByRole("button", { name: "Help", exact: true }).first().click();
    await page.waitForSelector("[role=dialog]");
    await scan(page, `${tag} dialog:Help`, found);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Ask North a question/ }).click();
    await page.waitForSelector("[role=dialog]");
    await scan(page, `${tag} dialog:Ask North`, found);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Appearance" }).click();
    await scan(page, `${tag} panel:Appearance`, found);
    await page.keyboard.press("Escape");
    await go(page, BASE + productHref);
    // The page must be interactive before the click counts, so click again if the dialog has not opened.
    await page.waitForSelector("text=Buy this", { timeout: 60000 });
    for (let tries = 0; tries < 4; tries++) {
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Buy this", exact: true }).click();
      if (await page.waitForSelector("text=Check before you pay", { timeout: 8000 }).then(() => true).catch(() => false)) break;
    }
    await page.waitForSelector("text=Check before you pay", { timeout: 30000 });
    await scan(page, `${tag} dialog:Review`, found);
    await page.getByRole("button", { name: /Pay with your saved PayPal/ }).click();
    await page.waitForFunction(() => { const h = document.querySelector("[role=dialog] h2"); return h && !/Checking|Check before/.test(h.textContent); }, null, { timeout: 30000 });
    await scan(page, `${tag} dialog:Decision`, found);
    await page.keyboard.press("Escape");
    await setPrefs(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".ng-bts");
    await scan(page, `${tag} panel:Behind the scenes`, found);
    runs += 6;
  }
}

// The login page, logged out.
const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const lp = await anon.newPage();
for (const mode of MODES) for (const theme of THEMES) for (const solid of [false, true]) {
  await go(lp, `${BASE}/login`);
  await lp.evaluate(([t, s, m]) => localStorage.setItem("north-appearance", JSON.stringify({ theme: t, mode: m, reduce: true, solid: s, behind: false })), [theme, solid, mode]);
  // The pages anyone can open without logging in: the front page, How North works and the login page.
  for (const path of ["/login", "/", "/how-it-works"]) {
    await go(lp, `${BASE}${path}`);
    await lp.waitForSelector("main h1", { timeout: 60000 });
    await lp.waitForTimeout(600);
    await scan(lp, `${theme}-${mode}${solid ? "+solid" : ""} ${path} (logged out)`, found);
    runs++;
  }
}
await browser.close();

// Group the same problem together.
const groups = new Map();
for (const f of found) for (const n of f.nodes) {
  const k = `${f.kind}:${f.id}:${n.target}:${n.why}`;
  const g = groups.get(k) ?? { ...f, node: n, where: [] };
  g.where.push(f.label);
  groups.set(k, g);
}
console.log(`${runs} scans. ${found.filter((f) => f.kind === "violation").length} violating scans, ${found.filter((f) => f.kind === "incomplete").length} contrast checks axe could not decide.`);
for (const g of groups.values()) console.log(`\n[${g.kind}] ${g.id} (${g.impact ?? "unknown"}) x${g.where.length}\n  ${g.node.target}\n  ${g.node.why}\n  e.g. ${g.where.slice(0, 3).join(" | ")}`);
process.exit(found.some((f) => f.kind === "violation") ? 1 : 0);
