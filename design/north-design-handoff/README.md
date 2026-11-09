# North — exact design handoff

This package contains the actual desktop and phone designs approved in the conversation, including Bloom, Tide, Dune, Grove, and Opal. It contains implementation source, not screenshots reconstructed into approximate code.

Current revision: Tide, Bloom, and Opal now have distinct background geometry on both desktop and phone. Tide uses flowing wave bands, Bloom uses overlapping petal shapes, and Opal uses faceted light planes. This replaces the earlier shared curved-ring treatment for those three themes.

## Start here

1. Open `reference/laptop.html` or `reference/phone.html` in a browser. The standalone references preserve the preview's wrapper and runtime. Internet access is needed to load the pinned icon library; the colours, layout, product illustration, and animations are in the files.
2. On the laptop reference, open **Appearance** to change themes or accessibility preferences. The phone reference has those controls beside the phone.
3. Try **Find an item**, **View saved**, the navigation tabs, **Ask North**, and **Try glass & spring**. These are sample interactions, not production shopping or payments.
4. To have Claude Code implement this in your app, put this entire folder in the app repository, then tell Claude Code to read and follow `CLAUDE_CODE_PROMPT.md`.

## What each file is for

| File | Purpose |
| --- | --- |
| `reference/laptop.html` | Openable, interactive laptop reference. |
| `reference/phone.html` | Openable, interactive phone reference. |
| `source/laptop.fragment.html` | Byte-for-byte source of the laptop design shown in the conversation. |
| `source/phone.fragment.html` | Byte-for-byte source of the phone design shown in the conversation. |
| `source/laptop.css`, `source/phone.css` | Exact CSS extracted from those sources. |
| `source/laptop.js`, `source/phone.js` | Exact interaction and spring-animation code extracted from those sources. |
| `tokens/themes.json`, `tokens/themes.css` | Resolved theme values for all five themes. CSS uses `.north-app[data-theme="..."]`. |
| `tokens/motion.json` | Animation values transcribed from the source. |
| `DESIGN_SYSTEM.md` | Material, typography, layout, motion, and integration decisions. |
| `CLAUDE_CODE_PROMPT.md` | Instructions for adapting the design to the existing app. |
| `ACCEPTANCE_CHECKLIST.md` | Concrete checks for matching the reference and preserving app behavior. |
| `MANIFEST.sha256` | Integrity hashes for the handoff files. |

## Source of truth

The complete HTML/CSS/JavaScript sources and the interactive references are authoritative. Written summaries help navigation; they do not replace the source. Both references initially show **Bloom** so the new theme can be reviewed. All five themes are available. The user's eventual production default can be chosen separately.

The `source/*.fragment.html` files are the original in-conversation fragments. They expect a small hosting runtime to initialise Lucide icons. For opening a file directly, use the complete `reference/*.html` exports instead. No ChatGPT account or access to the original conversation is required to inspect those files.

The prototype uses system fonts. Exact glyph shapes and text wrapping can vary across operating systems. For visual comparisons, use the same OS, browser, viewport, zoom, and font availability as the reference. Do not substitute a new typeface simply to make it feel more "premium".

## Integration boundary

This is a design handoff. Its sample balances, sample sellers, sample search result, and payment preview are fixtures. Preserve the real app's working agent flows, Guardian rules, trusted backend validation, PayPal integration, authentication, and error handling. Replace sample values with real data without changing the design hierarchy.

The glass is a browser implementation using translucency, blur, highlights, borders, and shadows. It is not Apple's native Liquid Glass renderer. The shipped spring curves and durations are included so they can be reproduced directly.

The files do not contain a native Figma document, production React components, a backend, or a validated accessibility certification. They contain the exact visual and interactive reference for the approved design. Accessibility preferences and cognitive-accessibility choices must survive implementation and still need testing with intended users.
