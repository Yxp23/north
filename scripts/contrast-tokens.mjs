// Contrast of the design's own colour pairs, worked out from the tokens (design/north-design-handoff/tokens/themes.json values in
// src/app/north-theme.css), including text on glass over the darkest part of the background curves. WCAG AA: 4.5 for text, 3 for large text and UI.
import fs from "node:fs";
const css = fs.readFileSync(new URL("../src/app/north-theme.css", import.meta.url), "utf8");
const read = (re) => {
  const out = {};
  for (const m of css.matchAll(re)) out[m[1]] = Object.fromEntries([...m[2].matchAll(/--n-([\w-]+):\s*(#[0-9a-f]{3,8})/gi)].map((x) => [x[1], x[2]]));
  return out;
};
const light = read(/html\[data-theme="(\w+)"\] \{([^}]*)\}/g);
const darkBase = Object.fromEntries([...css.matchAll(/html\[data-mode="dark"\] \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/--n-([\w-]+):\s*(#[0-9a-f]{3,8})/gi)].map((x) => [x[1], x[2]])));
const darkThemes = read(/html\[data-mode="dark"\]\[data-theme="(\w+)"\] \{([^}]*)\}/g);
const lightBase = Object.fromEntries([...css.matchAll(/^html \{([^}]*)\}/gm)].flatMap((m) => [...m[1].matchAll(/--n-([\w-]+):\s*(#[0-9a-f]{3,8})/gi)].map((x) => [x[1], x[2]])));
const themes = {};
for (const [name, t] of Object.entries(light)) themes[name] = { ...lightBase, ...t };
for (const [name, t] of Object.entries(darkThemes)) themes[`${name} (dark)`] = { ...lightBase, ...darkBase, ...t };
const rgb = (h) => { h = h.slice(1); if (h.length === 3) h = [...h].map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const mix = (top, a, bottom) => top.map((c, i) => c * a + bottom[i] * (1 - a));
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const aOf = (h) => (h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1);
let bad = 0;
let checked = 0;
for (const [name, t] of Object.entries(themes)) {
  const dark = name.endsWith("(dark)");
  const c = (k) => rgb(t[k]);
  // The page: paper, with the background shapes on top (62% in light, 42% in dark) and glass over that (the glass fill's own alpha, worst case over the deep shape).
  const shape = mix(c("deep"), dark ? 0.64 : 0.62, c("light"));
  const glassOver = (under) => mix([255, 255, 255], aOf(t.glass), under);
  const pairs = [
    // text on the surfaces it sits on
    ["ink on content", c("ink"), c("content"), 4.5], ["muted on content", c("muted"), c("content"), 4.5],
    ["ink on paper", c("ink"), c("paper"), 4.5], ["muted on paper", c("muted"), c("paper"), 4.5],
    ["ink on the light page tint", c("ink"), c("light"), 4.5], ["ink on a background shape", c("ink"), shape, 4.5], ["ink on haze (page edge)", c("ink"), c("haze"), 4.5],
    ["ink on quiet (chips, boxes)", c("ink"), c("quiet"), 4.5],
    ["ink on glass over a shape (nav, pills)", c("ink"), glassOver(shape), 4.5], ["ink on glass over haze", c("ink"), glassOver(c("haze")), 4.5],
    ["ink (92%) on glass, a tab that is not selected", mix(c("ink"), 0.92, glassOver(shape)), glassOver(shape), 4.5],
    // buttons and accents
    ["button text (action) on accent", c("action"), c("accent"), 4.5],
    ["accent text on content (links, prices)", c("accent"), c("content"), 4.5], ["accent text on paper", c("accent"), c("paper"), 4.5],
    // status: the same meanings in every theme and in both modes
    ["success on its background", c("success"), rgb(t["success-bg"]), 4.5], ["success on content", c("success"), c("content"), 4.5],
    ["wait on its background", c("state"), c("state-bg"), 4.5], ["wait on content", c("state"), c("content"), 4.5],
    ["stopped on its background", c("stop"), c("stop-bg"), 4.5], ["stopped on content", c("stop"), c("content"), 4.5],
    // controls and focus (3:1)
    ["control border (muted) on content", c("muted"), c("content"), 3], ["control border (muted) on paper", c("muted"), c("paper"), 3],
    ["selected border (accent) on content", c("accent"), c("content"), 3], ["focus ring on paper", rgb(t.focus), c("paper"), 3], ["focus ring on content", rgb(t.focus), c("content"), 3],
  ];
  for (const [label, fg, bg, need] of pairs) {
    const r = ratio(fg, bg);
    checked++;
    if (r < need) { bad++; console.log(`FAIL ${name}: ${label} = ${r.toFixed(2)} (needs ${need})`); }
  }
  // Status must keep its look: stopped is red-ish (more red than green or blue), success is green-ish, wait is amber.
  const [sr, sg, sb] = c("stop"), [gr, gg, gb] = c("success"), [wr, wg, wb] = c("state");
  const ok = sr > sg + 40 && sr > sb + 40 && gg > gr + 30 && gg > gb + 10 && wr > wb + 60 && wg > wb + 40;
  checked++;
  if (!ok) { bad++; console.log(`FAIL ${name}: a status colour no longer reads as stopped (red), success (green) or wait (amber)`); }
}
console.log(`${checked} checks across ${Object.keys(themes).length} palettes (5 light, 5 dark).`);
console.log(bad ? `${bad} pair(s) below AA.` : "Every pair is at or above AA in all palettes.");
process.exit(bad ? 1 : 0);
