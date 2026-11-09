# North design system — implementation notes

## Visual intention

North is an adult shopping companion with spending protections. The approved direction uses an elemental palette, clear content surfaces, reflective navigation/controls, and interaction-triggered springs. Shopping is the main task; the money summary helps the user decide.

Keep the background static. The elemental curves are CSS geometry, not an animated wallpaper. Their shape, placement, layering, and opacity are in the complete source. They sit behind the controls to make the translucent material visible. A generic gradient or a flat colour does not reproduce them.

### Distinct background geometry

Theme identity includes geometry, not just colour. Read the final element-specific `.ng-landscape::before` and `::after` overrides at the end of each source stylesheet; these intentionally override earlier base shapes.

| Theme | Background geometry |
| --- | --- |
| Tide | Broad flowing wave bands, including a layered water-like lower edge. |
| Dune | Existing asymmetric rounded mineral/dune contours. |
| Grove | Existing organic leaf-like contours. |
| Opal | Angular clipped planes with narrow reflective facets; no circular rings. |
| Bloom | Overlapping asymmetric petal silhouettes with soft inner highlights; no concentric rings. |

The laptop reference includes an additional 650px breakpoint for these theme shapes. The phone reference has its own geometry sized to the phone composition. Preserve the static, restrained opacity and clear content surfaces. Do not map all five themes to the same decorative shape with different colours.

## Theme system

| Theme | Character | Main background | Text | Main action |
| --- | --- | --- | --- | --- |
| Tide | Water, sea glass | `#F0F7F8` | `#244249` | `#2B5C66` |
| Dune | Earth, warm mineral | `#F7F2EB` | `#48352D` | `#765145` |
| Grove | Leaves, soft olive | `#F3F5ED` | `#35432E` | `#4D6340` |
| Opal | Light, pearl silver | `#F5F5F2` | `#292A2B` | `#303335` |
| Bloom | Petals, soft rosewood | `#F9F3F3` | `#4C343E` | `#78505F` |

`tokens/themes.json` includes every resolved custom property, not just the abbreviated values above. Theme changes do not change layout, navigation order, spending rules, or status meanings. The reference's success, wait, and stop colours remain separate from the theme accent.

## Materials

The `.ng-glass` rule, both pseudo-elements, pointer-highlight handler, and `.ng-shine` keyframe belong together. Copying only `backdrop-filter` loses the appearance.

- Main glass fill: `#FFFFFF59`.
- Backdrop: `blur(14px) saturate(1.65)` plus the WebKit-prefixed property.
- Bright edge: `--n-glass-light`, normally `#FFFFFFFA`.
- Shadows: layered inset highlights, a theme-tinted lower inner edge, a soft outside shadow, and a faint extra outline. Read the exact source declaration.
- The reflection combines a pointer-positioned radial highlight with a brief diagonal sweep. It is not an automatic looping shine.
- Money, item information, and payment explanations use near-opaque `--n-content` surfaces. Large reading areas do not use transparent text backgrounds.
- Solid mode replaces glass with content surfaces, removes backdrop filtering and reflective pseudo-elements, and preserves hierarchy.

## Typography and layout

The source uses `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Body type is 17px in the product. Font weights are 400 and 500. Desktop headings are controlled with the actual clamp expression in the CSS, rather than scaled up from a screenshot. Money uses tabular figures. Cents have a smaller visual size; assistive text preserves a continuous currency amount.

The mobile reference is a 364px device composition with a consistent lower tab bar. Its external palette controls, sample status bar, home indicator, and device frame are preview presentation, not production business features. Use the product's content spacing and controls when making a real responsive page.

The laptop reference has a maximum main-content width of 1080px, a top glass navigation capsule, a left shopping area and right money summary, then the saved item and a short explanation of the rules. The Ask North control sits below the content. Desktop-specific rules occur after the common rules and intentionally override them. Do not omit those overrides.

Read all source media queries. In the laptop reference, 870px reflows the header/navigation and 650px stacks the main layout. For an integrated production app, use the approved phone composition at phone widths, retaining bottom navigation there. Verify the transitions rather than enlarging the phone frame to fill a laptop screen.

## Motion

The implementation uses an underdamped spring sampler with mass 1 and 49 sampled frames. The last sample is explicitly settled at 1. Web Animations API keyframes use linear interpolation between the sampled spring values.

| Interaction | Duration | Stiffness | Damping | What moves |
| --- | --- | --- | --- | --- |
| Button release | 490ms | 440 | 21 | Scale from 0.955 back to 1, including spring overshoot. |
| Tab selection | 560ms | 350 | 21 | Horizontal indicator translation, plus a bounded stretch with coefficient 0.08. |
| Sheet/dialog entry | 610ms | 280 | 25 | Phone: 240px upward entry; laptop: 110px entry while retaining horizontal centring. |
| Reflective sweep | 700ms | — | — | A single diagonal highlight sweep after interaction. |

The source does not animate initial screen content or continuously animate the background. Sheet close is immediate in this reference; do not assume a matching exit spring was already specified. Repeated interactions can cancel an active animation. Never make the user wait for an animation before the next action.

Reduced motion is active when the app preference or the OS setting requests it. The explicit solid-surface preference is independent. Browser support for reading the OS transparency preference varies, so preserve the explicit control.

## Assets and dependencies

The headphones are an exact CSS illustration in `.ng-headphones` and its pseudo-elements; no generated image, stock photo, or external asset is required. North's star is a text glyph in the source. Lucide supplies navigation/action icons. The complete exported reference pins the icon runtime used by the preview; the raw fragments expect icon initialisation from their host. In a real app, use the repository's matching icon components and inspect sizing/strokes against the references.

The standalone exports include a preview runtime and iframe sandbox. Those files are runnable references, not the architecture to ship inside the real app. The extracted component CSS and JavaScript are easier to inspect during migration.

## Data and safety boundaries

The demo balance is $180; $800 is set aside for rent; the saved headphones cost $89; the preview shows $91 remaining. These are fixtures, not account data. The preview does not run real agents, detect a scam, query live prices, or initiate PayPal payments. The paused $349 purchase is an example of the state presentation.

Bind the finished UI to actual existing services. Keep authorisation checks in the trusted backend. A theme, dialog, or animation must never grant payment permission. Screens for real attacks, agent checkpoints, and evidence should use this system without presenting mock evidence as live results.
