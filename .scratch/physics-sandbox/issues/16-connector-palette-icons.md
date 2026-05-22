# 16 — Icons for the connector palette (Spring / Weld / Pin)

Status: needs-triage

## Parent

`.scratch/physics-sandbox/PRD.md`

## What to build

The body palette already shows a Rough.js `BodyPreview` thumbnail above each
label. The **connector** palette buttons (Spring, Weld, Pin) are still
text-only, so they read as plain buttons next to the illustrated body tiles.
Give each connector an on-theme glyph so the palette reads as one consistent,
illustrated toolset.

This is **design-led** (`needs-triage`): decide the rendering approach before
implementing.

- **Static icons** — the project now has an icon set under `src/assets/icons/`
  surfaced through `src/ui/Icon.tsx` (a CSS mask painted with `currentColor`).
  Candidate glyphs already present: `interface/link.svg` (spring/link),
  `interface/pin.svg` (pin); weld has no obvious match and may need a custom
  one. Quick to wire, but these are line icons, not the hand-drawn canvas style.
- **Rough.js previews** — mirror `BodyPreview` with a tiny `ConnectorPreview`
  drawing a doodled spring coil / weld seam / hinge. Most consistent with the
  canvas aesthetic; more work, and connectors have no single shape to depict.

Whichever way, keep the palette layout working in both the desktop floating
strip and the mobile horizontal scroll row, and keep the connector `label`/help
text for accessibility (tooltip / screen readers).

## Notes

- Related: [issue 09](09-expressive-property-controls.md) covers theming the
  property-panel sliders/checkboxes — the same "match the doodle vibe" thread,
  but for the property controls rather than the palette.
- Precedent: `src/ui/BodyPreview.tsx` (Rough.js body thumbnails) and
  `src/ui/Icon.tsx` (mask-based static icons) are both available models.
