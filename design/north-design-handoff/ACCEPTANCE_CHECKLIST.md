# North implementation acceptance checklist

## Visual match

- [ ] Compare rendered UI with the complete reference at the same viewport, browser, zoom, and font environment.
- [ ] All five themes use the exact resolved tokens; initial reference state is Bloom.
- [ ] Background curves retain their geometry and are static.
- [ ] Tide, Bloom, and Opal have visibly different silhouettes: waves, petals, and faceted planes. Their final theme-specific CSS overrides are present on both desktop and phone. Dune and Grove retain their existing contours.
- [ ] Content remains near-opaque; navigation and selected controls retain visible glass edges, blur, and depth.
- [ ] Desktop has the approved top navigation and shopping-led two-column composition.
- [ ] Phone has the approved content order and bottom navigation, without the preview's external palette sidebar in the production UI.
- [ ] Typography, whitespace, card radii, shadows, icon sizing, and money formatting match the source.
- [ ] The same North star and wordmark proportions are retained.
- [ ] Desktop dialogs stay horizontally centred throughout their spring entry.

## Interactions

- [ ] Home, Shop, Saved, and My money preserve the selected state correctly.
- [ ] Desktop Appearance offers all five themes and closes with Escape or its close control.
- [ ] Button rebound, tab translation/stretch, sheet entry, and reflective sweep match the included curves and durations.
- [ ] A reflective sweep occurs briefly on interaction and does not loop.
- [ ] Theme choice does not rearrange controls or modify spending rules.
- [ ] Search, item review, save, and real checkout use the existing application data and services.
- [ ] Loading, empty, error, approval, wait, and refusal states use the same style and clear wording.

## Accessibility

- [ ] Reduced motion disables decorative springs and sweeps; there is no forced animated wallpaper.
- [ ] Solid surfaces can be selected independently from the colour theme and motion setting.
- [ ] Keyboard focus stays visible. Dialog focus is contained and restored on close.
- [ ] Navigation and controls have descriptive names and visible labels.
- [ ] Money totals, seller, payment effect, and remaining money are understandable before confirming.
- [ ] State meaning is not conveyed by colour alone.
- [ ] Test at 390px, 768px, 1024px, and 1440px widths, plus narrow 320px and increased text/zoom where supported.
- [ ] No clipping, overlapping targets, unreadable glass text, or unintended horizontal scrolling.

## Application integrity

- [ ] Existing authentication, user data, agent integrations, Guardian decisions, backend checks, and PayPal behavior remain functional.
- [ ] Production decisions and account values are not replaced by prototype fixtures.
- [ ] Hidden or unpictured existing features remain available through sensible navigation.
- [ ] Build and relevant existing checks pass.
- [ ] Report visual verification limits and unresolved differences honestly.
