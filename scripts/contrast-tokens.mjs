// Contrast of the design's own colour pairs, worked out from the tokens (design/north-design-handoff/tokens/themes.json values in
// src/app/north-theme.css), including text on glass over the darkest part of the background curves. WCAG AA: 4.5 for text, 3 for large text and UI.
import fs from "node:fs";
const css = fs.readFileSync(new URL("../src/app/north-theme.css", import.meta.url), "utf8");
const themes = {};
for (const m of css.matchAll(/\.north-app\[data-theme="(\w+)"\] \{([^}]*)\}/g)) {
  themes[m[1]] = Object.fromEntries([...m[2].matchAll(/--n-([\w-]+):\s*(#[0-9a-f]{3,8})/gi)].map((x) => [x[1], x[2]]));
}
const rgb = (h) => { h = h.slice(1); if (h.length === 3) h = [...h].map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const alpha = (h) => (h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1);
const mix = (top, a, bottom) => top.map((c, i) => c * a + bottom[i] * (1 - a));
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let bad = 0;
for (const [name, t] of Object.entries(themes)) {
  const c = (k) => rgb(t[k]);
  // Glass: #ffffff59 (35% white) over the darkest thing behind it (the deep curve), plus the brightest-case highlight is ignored (worst case).
  const glassWorst = mix([255, 255, 255], 0.35, c("deep"));
  const glassOnHaze = mix([255, 255, 255], 0.35, c("haze"));
  const pairs = [
    ["ink on content", c("ink"), c("content"), 4.5], ["muted on content", c("muted"), c("content"), 4.5], ["ink on paper", c("ink"), c("paper"), 4.5],
    ["muted on paper", c("muted"), c("paper"), 4.5], ["muted on light", c("muted"), c("light"), 4.5], ["ink on the deep curve (62% over the light page)", c("ink"), mix(c("deep"), 0.76, c("light")), 4.5],
    ["ink on haze (page edge)", c("ink"), c("haze"), 4.5], ["ink on quiet", c("ink"), c("quiet"), 4.5],
    ["action on accent (buttons)", c("action"), c("accent"), 4.5], ["ink on glass over haze (nav, pills)", c("ink"), glassOnHaze, 4.5], ["ink on glass over deep (worst)", c("ink"), glassWorst, 4.5],
    ["success on content", c("success"), c("content"), 4.5], ["success on success-bg", c("success"), rgb("#e3efe6"), 4.5], ["state on state-bg", c("state"), c("state-bg"), 4.5], ["stop on stop-bg", c("stop"), c("stop-bg"), 4.5],
    ["accent on content (links, borders)", c("accent"), c("content"), 4.5], ["muted border on content (inputs)", c("muted"), c("content"), 3], ["muted border vs paper (control borders)", c("muted"), c("paper"), 3],
  ];
  for (const [label, fg, bg, need] of pairs) {
    const r = ratio(fg, bg);
    if (r < need) { bad++; console.log(`FAIL ${name}: ${label} = ${r.toFixed(2)} (needs ${need})`); }
  }
}
console.log(bad ? `${bad} pair(s) below AA.` : "Every pair is at or above AA in all five themes.");
