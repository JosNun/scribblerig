# PRD: Add a favicon

Status: done

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

`index.html` ships no `<link rel="icon">` and there's no
`favicon.ico` in the project. Browsers fall back to the default
globe glyph in the tab and on bookmarks, which makes ScribbleRig
indistinguishable from any other dev-server tab.

## Solution

Add an icon and wire it up in `index.html`:

- Drop a source file (SVG preferred, so it scales and respects the
  Mynerve / Solarized vibe) into the project root or `public/` —
  Vite serves `public/` at the web root.
- Reference it from `index.html`:

  ```html
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  ```

- Optional companion `favicon.ico` for browsers that don't render
  SVG favicons (older Safari iOS, some embed contexts). Low priority
  — the SVG covers Chrome / Firefox / desktop Safari.

## Design

Open question. Options worth sketching:

- A scribbled circle (the "ball" body, the project's tracer-bullet
  primitive) in Solarized accent.
- The letters "SR" in Mynerve.
- A tiny chain of two bodies + a connector — busiest, but most
  identifiable as ScribbleRig at 16 px.

Pick one in implementation; not worth burning PRD bytes on.

## Out of scope

- PWA manifest icons / apple-touch-icon. The current app isn't
  installable; revisit when/if we add a manifest.
- OG image — tracked separately under `.scratch/og-share/`.

## Tests

- Manual: load the dev server, confirm the tab icon is no longer
  the browser default.
- No automated test — favicon presence isn't a regression we expect
  to silently lose.
