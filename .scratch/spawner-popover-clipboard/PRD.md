# PRD: Copy/paste + Alt-drag duplicate in the spawner popover

Status: needs-triage

## Parent

`.scratch/scribblerig/PRD.md`

## Problem

The spawner popover hosts a mini-canvas where the user authors the
template — the bodies + connectors that get cloned into the world on
each emission. Today the popover is missing the convenience moves the
main canvas has:

1. **Cmd/Ctrl+C / Cmd/Ctrl+V** don't act on the popover's selection.
2. **Cmd/Ctrl+D** doesn't duplicate the popover's selected body.
3. **Alt/Option-drag** doesn't duplicate-as-you-drag (the main canvas
   does this; see `App.tsx`'s pointerdown branch on `e.altKey`).

For users building a richer template — say, a ball welded to a small
platform that should spawn as a unit — these omissions force them to
re-place each piece from scratch and re-draw each connector. It's
particularly painful given the popover is a soft constraint
(small-content space), so the user reaches for keyboard shortcuts.

## Solution

Mirror the main-canvas copy/paste/duplicate behavior **inside the
spawner popover scope**, so the same keyboard shortcuts and Alt-drag
work but operate on the spawner's `template.bodies` /
`template.connectors` instead of the room's top-level bodies.

Concretely:

- The popover's clipboard reuses the same `clipboardRef` shape (a
  subgraph `{ bodies, connectors }`) — pasting a body that was copied
  from the main canvas into the popover does the right thing
  (re-mints ids inside the template scope, drops cross-scope
  connector refs).
- Cmd/Ctrl+D from inside the popover calls a template-scoped
  duplicate (uses `cloneItem` + `addBodyToTemplate` /
  `addConnectorToTemplate`).
- Alt+pointerdown on a template body starts a drag with a fresh
  duplicate, same pattern as `onCanvasPointerDown`'s Alt branch.

## Out of scope

- Cross-scope drag (drag a body from the main canvas into the
  popover, or vice versa). That's a separate feature — the popover
  has a drop-target hook for palette drops but not for arbitrary
  body drags yet.
- Multi-select inside the popover. (The popover is a small affordance;
  multi-select chrome would crowd it. Single-body shortcut behavior
  is the v1 scope here.)

## Implementation pointers

- `src/SpawnerPopover.tsx` (or wherever the popover lives) owns
  pointer events for the mini-canvas. The keyboard handler in
  `App.tsx` (`useEffect` listening for Cmd+C/V/D) needs to detect
  when the popover has focus and route to the popover's equivalents.
- `templateSelected` state in `App.tsx` already tracks the selected
  template body — the new template-scope copy reads from it.

## Tests

- A unit test on the template-scope `selectionSubgraph` analog: given
  a spawner with bodies inside its template, copying the popover
  selection produces a sane subgraph.
- Manual: open the spawner popover, select a body, Cmd+C / Cmd+V,
  confirm a duplicate appears in the template (and shows up in the
  emitted bodies on Play).

## Notes

- Came up while authoring the onboarding tutorial. The spawner's
  template is a single ball today; if the tutorial later evolves to
  spawn a more elaborate item (or a user does), this convenience
  matters quickly.
