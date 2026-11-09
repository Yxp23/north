// Runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on every screen, in all five themes, in normal and solid-surface modes, and on the
// open dialogs and panels. Needs a running North (BASE_URL, default http://localhost:3200) in practice mode.
//   node scripts/a11y.mjs            everything
//   node scripts/a11y.mjs quick      only Bloom and Opal, to check a fix
import fs from "node:fs";
import { createRequire } from "node:module";
import { BASE, launch, loggedInContext } from "./ui-lib.mjs";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const THEMES = process.argv[2] === "quick" ? ["bloom", "opal"] : ["tide", "dune", "grove", "opal", "bloom"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = ["/", "/shop", "/saved", "/money", "/rules", "/rules/new", "/rules/change/big_buy", "/assistants", "/payments", "/connect", "/check", "/find", "/choose", "/reorder", "/how-it-works", "/try-to-break", "/assistant-demo"];

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
await page.goto(`${BASE}/shop`, { waitUntil: "load" });
const productHref = await page.locator('a[href^="/shop/"]').first().getAttribute("href");
const pages = [...PAGES, productHref];
let runs = 0;

for (const theme of THEMES) {
  for (const solid of [false, true]) {
    await page.evaluate(([t, s]) => localStorage.setItem("north-appearance", JSON.stringify({ theme: t, reduce: true, solid: s, behind: false })), [theme, solid]);
    for (const path of pages) {
      await page.goto(BASE + path, { waitUntil: "load" });
      await page.waitForSelector("main h1, main h2", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(500);
      await scan(page, `${theme}${solid ? "+solid" : ""} ${path}`, found);
      runs++;
    }
    // Overlays: Help, Ask North, Appearance, Behind the scenes (with real steps), the review dialog and a decision.
    const tag = `${theme}${solid ? "+solid" : ""}`;
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.waitForSelector("main h1", { timeout: 20000 });
    await page.getByRole("button", { name: "Help", exact: true }).first().click();
    await page.waitForSelector("[role=dialog]");
    await scan(page, `${tag} dialog:Help`, found);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Ask North a question/ }).click();
    await page.waitForSelector("[role=dialog]");
    await scan(page, `${tag} dialog:Ask North`, found);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Appearance" }).click();
    await scan(page, `${tag} panel:Appearance`, found);
    await page.keyboard.press("Escape");
    await page.goto(BASE + productHref, { waitUntil: "load" });
    await page.getByRole("button", { name: "Buy this", exact: true }).click();
    await page.waitForSelector("text=Check before you pay");
    await scan(page, `${tag} dialog:Review`, found);
    await page.getByRole("button", { name: /Pay with your saved PayPal/ }).click();
    await page.waitForFunction(() => { const h = document.querySelector("[role=dialog] h2"); return h && !/Checking|Check before/.test(h.textContent); }, null, { timeout: 30000 });
    await scan(page, `${tag} dialog:Decision`, found);
    await page.keyboard.press("Escape");
    await page.evaluate(([t, s]) => localStorage.setItem("north-appearance", JSON.stringify({ theme: t, reduce: true, solid: s, behind: true })), [theme, solid]);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".ng-bts");
    await scan(page, `${tag} panel:Behind the scenes`, found);
    runs += 6;
  }
}

// The login page, logged out.
const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const lp = await anon.newPage();
for (const theme of THEMES) for (const solid of [false, true]) {
  await lp.goto(`${BASE}/login`, { waitUntil: "load" });
  await lp.evaluate(([t, s]) => localStorage.setItem("north-appearance", JSON.stringify({ theme: t, reduce: true, solid: s, behind: false })), [theme, solid]);
  await lp.reload({ waitUntil: "load" });
  await lp.waitForSelector("main h1");
  await scan(lp, `${theme}${solid ? "+solid" : ""} /login`, found);
  runs++;
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
