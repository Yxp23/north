# Implement North from the included exact design source

You are working on my existing North app. Restyle its frontend to match the desktop and mobile references in this folder as closely as possible. Treat this as an implementation and adaptation task; the visual direction is already chosen.

## Read and inspect before editing

1. Read `README.md`, `DESIGN_SYSTEM.md`, and `ACCEPTANCE_CHECKLIST.md`.
2. Read both complete `source/*.fragment.html` files. Inspect the exact CSS, custom properties, component structure, and JavaScript. Do not infer the design from the prose alone.
3. Open `reference/laptop.html` and `reference/phone.html` if browser tooling is available. Try all five themes, theme preferences, tab changes, search, the item-review modal, and the spring demo.
4. Inspect the existing repository, its instructions, frontend framework, routing, data stores, agent integration, Guardian/payment boundaries, component library, and test/build commands.

## Preserve the reference

- Use the exact theme tokens, glass treatment, border radii, shadows, typography stack, spacing, and decorative curves from the source. All five themes must work: Tide, Dune, Grove, Opal, and Bloom.
- Preserve distinct background geometry, including the final theme-specific CSS overrides: Tide has wave bands, Bloom has overlapping petals, and Opal has faceted planes. Do not recreate these as the same circles with different colours. Preserve Dune and Grove's existing contours as well.
- Reproduce the laptop composition, including top glass navigation, shopping-led main area, money summary, saved item, and Ask North control. On narrow screens, use the approved phone arrangement and bottom navigation. Translate the two references into one responsive application; do not embed the phone frame or theme-preview sidebar in the production app.
- Adapt the phone's preview-only theme sidebar into Appearance settings. Preserve the desktop Appearance control. Keep appearance preferences independent of financial permissions.
- Reuse the exact spring sampler or an equivalent curve with matching values. Read `tokens/motion.json` and the source implementation. Reproduce the tab indicator's translation and stretch, button rebound, sheet entry, and brief reflective sweep. Do not replace them with generic fade transitions or continuous bouncing.
- Keep the system-font stack, labelled icons, and product illustration unless real product media is available from the app's existing data. Keep current Lucide sizing and stroke treatments consistent. Preserve the North star and wordmark proportions.
- Keep status meanings consistent across themes. The theme does not recolour a stopped payment into a positive state.

## Preserve the real application

- Retain working authentication, real catalogue/search/data bindings, agent workflows, backend Guardian enforcement, and PayPal sandbox integration.
- Retain useful existing features even when they are not pictured in the reference. Style their screens with the same system and put technical details behind optional disclosure where appropriate.
- Never replace backend decisions or payment outcomes with the reference's hardcoded sample results. Never change a payment-authorisation boundary to make a UI demonstration easier.
- Make the current real flows usable through the new design. Handle loading, empty, error, approval, wait, and refusal states with the same component language. The included sample payment is only a visual reference.
- Keep preference changes and any persistence in the existing app's settings architecture. Do not store secrets or payment credentials as appearance state.

## Accessibility and motion

Preserve visible labels, readable money amounts, keyboard focus, accessible names, error feedback, and review before consequential payment confirmation. Honour reduced-motion preferences and provide an explicit Reduce motion control. Provide a solid-surfaces option regardless of whether the browser exposes the OS transparency preference. Keep text stationary, with no looping background movement or automatic reflective sweeps. Use a properly managed dialog with focus restoration and Escape support. Test at narrow widths and increased text/zoom.

## Work through to verification

Implement in the repository's existing stack, extracting shared components and tokens where helpful. Do not add a second app or replace the existing app with the standalone preview wrapper. The reference wrapper is for inspection; it includes sandbox/hosting utilities that do not belong in the production UI.

Run the repository's relevant build and checks. Compare the rendered result against the references at matching viewport sizes and appearance settings. Include 390px mobile, 768px tablet, 1024px, and 1440px laptop/desktop widths. Use browser screenshots for your own comparison if available. Check both motion-enabled and reduced-motion/solid-surface modes. Correct mismatches in spacing, wrapping, materials, modal placement, and animation before reporting completion.

If browser inspection is unavailable, still implement and run available checks, then explicitly state that visual matching remains unverified. Do not claim an exact match without comparing rendered output.

At completion, report the changed files, the flows checked, and any remaining mismatch or limitation. Work within my existing authorised task scope; ask only if a material product decision or missing dependency truly blocks implementation.
